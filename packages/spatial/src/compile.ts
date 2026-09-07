import type { Extents, Instance, Pose, Scene } from '@robopomelo/spec';
import { catalogEntry, type Catalog, type CatalogEntry, type Display } from './catalog.js';
import { footprintFor, heightIntervalFor, isPose, resolveParameters, transformPolygon, type Point, type Polygon } from './geometry.js';
import { SpatialError, hashJson } from './hash.js';
/** Compiles canonical instances into immutable world geometry: right-handed
 * Z-up meters and radians. Collision comes only from the catalog collision
 * definition and instance dimensions, never from display geometry. */
export type DimensionState = 'known' | 'unverified' | 'estimated';
export type CollisionVolume = { polygon: Polygon; zMinM: number; zMaxM: number };
export type CompiledObject = {
  instanceId: string; assetId: string; assetVersion: string; dimensionState: DimensionState;
  collision: CollisionVolume; display: { primitive: Display['primitive']; materialId: string; sizeM: Extents; pose: Pose };
  loadedCollision?: CollisionVolume; driveOriginOffsetM?: Point; loadOffsetM?: Point;
};
export type CompiledScene = { sceneId: string; sourceHash: string; objects: readonly CompiledObject[] };
export type CompileOptions = { instanceLimit?: number };
export const INSTANCE_LIMIT = 5000;
const fail = (code: string, message: string): never => { throw new SpatialError(code, message); };
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); }
  return value;
}
function parametersFor(entry: CatalogEntry, instance: Instance): { params: Record<string, number>; state: DimensionState } {
  const dims = instance.dimensions;
  if (dims.state !== 'known' && dims.state !== 'unverified') return { params: resolveParameters(entry), state: 'estimated' };
  const schema = entry.parameterSchema.properties, params: Record<string, number> = {};
  for (const key of ['lengthM', 'widthM', 'heightM'] as const) {
    const value = dims.value[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail('PARAMETER_OUT_OF_RANGE', `${instance.id} dimension ${key} must be a positive finite number.`);
    if (Object.hasOwn(schema, key)) params[key] = value;
  }
  return { params: resolveParameters(entry, params), state: dims.state };
}
function compileInstance(instance: Instance, catalog: Catalog): CompiledObject {
  if (!instance.asset || typeof instance.asset !== 'object') fail('ASSET_UNKNOWN', `${instance.id} has no asset reference.`);
  const entry = catalogEntry(catalog, instance.asset.id, instance.asset.version);
  if (instance.asset.sha256 !== entry.sha256) fail('ASSET_HASH_MISMATCH', `${instance.id} references ${entry.id}@${entry.version} with a different content hash.`);
  if (!isPose(instance.pose)) fail('POSE_INVALID', `${instance.id} pose must have finite xM, yM, zM and yawRad.`);
  const { params, state } = parametersFor(entry, instance);
  const { zMinM, zMaxM } = heightIntervalFor(entry, params);
  const volume = (polygon: Polygon): CollisionVolume => ({ polygon: transformPolygon(polygon, instance.pose), zMinM: instance.pose.zM + zMinM, zMaxM: instance.pose.zM + zMaxM });
  const object: CompiledObject = {
    instanceId: instance.id, assetId: entry.id, assetVersion: entry.version, dimensionState: state,
    collision: volume(footprintFor(entry, params)),
    display: { primitive: entry.display.primitive, materialId: entry.display.materialId, sizeM: { lengthM: params.lengthM!, widthM: params.widthM!, heightM: params.heightM! }, pose: { ...instance.pose } },
  };
  if (entry.robot) {
    object.loadedCollision = volume(footprintFor(entry, params, { loaded: true }));
    object.driveOriginOffsetM = [...entry.robot.driveOriginOffsetM];
    object.loadOffsetM = [...entry.robot.loadOffsetM];
  }
  return object;
}
export function compileScene(scene: Scene, catalog: Catalog, options: CompileOptions = {}): CompiledScene {
  const limit = options.instanceLimit ?? INSTANCE_LIMIT;
  if (!scene || typeof scene !== 'object' || typeof scene.id !== 'string' || !Array.isArray(scene.instances)) fail('SCENE_INVALID', 'A scene with an id and instances array is required.');
  if (scene.instances.length > limit) fail('SCENE_TOO_LARGE', `Scene ${scene.id} has ${scene.instances.length} instances; the limit is ${limit}.`);
  const ids = new Set<string>();
  for (const instance of scene.instances) {
    if (typeof instance.id !== 'string' || !instance.id) fail('INSTANCE_INVALID', `Scene ${scene.id} contains an instance without an id.`);
    if (ids.has(instance.id)) fail('INSTANCE_DUPLICATE', `Scene ${scene.id} repeats instance id ${instance.id}.`);
    ids.add(instance.id);
  }
  const sorted = [...scene.instances].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const objects = sorted.map((instance) => compileInstance(instance, catalog));
  return deepFreeze({ sceneId: scene.id, sourceHash: hashJson(scene), objects });
}
