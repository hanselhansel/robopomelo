import type { AssetRef, Drive } from '@robopomelo/spec';
import bundled from '../assets/catalog.json';
import { containsPolygon, footprintFor, heightIntervalFor, isConvex, isPoint, isPolygon, isSimple, type Point, type Polygon } from './geometry.js';
import { SpatialError, hashJson } from './hash.js';
/** Reviewed, content-addressed catalog of generic primitives and parameterized
 * assemblies. Entries are trusted library data interpreted by compiler code,
 * never per-scene generated source. */
export type NumberParameter = { type: 'number'; minimum: number; maximum: number; default: number; description: string };
export type ParameterSchema = { type: 'object'; additionalProperties: false; properties: Record<string, NumberParameter> };
export type Collision =
  | { shape: 'box'; extentsFromParams: { lengthM: string; widthM: string }; heightFromParam: string; zMinFromParam?: string }
  | { shape: 'convex-polygon'; footprintM: Polygon; heightFromParam: string; zMinFromParam?: string };
export type Display = { primitive: 'box' | 'cylinder' | 'extrusion'; materialId: string };
export type RobotSpec = {
  drive: Drive; loadedFootprintM: Polygon; maxSpeedMps: number; maxAngularRadps: number; accelerationMps2: number; decelerationMps2: number;
  reverse: boolean; driveOriginOffsetM: Point; loadOffsetM: Point;
};
export type CatalogEntry = {
  id: string; version: string; kind: 'object' | 'assembly'; title: string; description: string; note: string;
  parameterSchema: ParameterSchema; collision: Collision; display: Display;
  exportProfiles: { isaac: { usdPrimType: 'Cube' | 'Cylinder' | 'Xform'; notes: string } };
  license: { spdx: string; source: string }; robot?: RobotSpec; sha256: string;
};
export type Catalog = { formatVersion: '1.0.0'; entries: CatalogEntry[] };
type Raw = Record<string, unknown>;
const fail = (code: string, message: string): never => { throw new SpatialError(code, message); };
const ID = /^[a-z][a-z0-9-]{0,63}$/, VERSION = /^\d+\.\d+\.\d+$/, HASH = /^[a-f0-9]{64}$/;
const UNSAFE_KEYS = new Set(['uri', 'url', 'href', 'src', 'script', 'scripts', 'onload', 'javascript', 'eval']);
const UNSAFE_TEXT = /(?:^|[^a-z])(?:https?|file|ftp|data|javascript|blob):|<script|\/\/[a-z0-9-]+\.[a-z]{2,}/i;
function closed(value: unknown, required: string[], optional: string[] = [], what = 'entry'): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('CATALOG_INVALID', `${what} must be an object.`);
  const record = value as Raw;
  for (const key of required) if (!Object.hasOwn(record, key)) return fail('CATALOG_INVALID', `${what} is missing ${key}.`);
  for (const key of Object.keys(record)) if (!required.includes(key) && !optional.includes(key)) return fail('CATALOG_INVALID', `${what} has unknown field ${key}.`);
  return record;
}
const str = (r: Raw, key: string, max: number, what: string): string => {
  const v = r[key];
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : fail('CATALOG_INVALID', `${what}.${key} must be text up to ${max} characters.`);
};
const num = (r: Raw, key: string, what: string): number => {
  const v = r[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fail('CATALOG_INVALID', `${what}.${key} must be a finite number.`);
};
const oneOf = <T extends string>(r: Raw, key: string, allowed: readonly T[], what: string): T => {
  const v = r[key];
  return allowed.includes(v as T) ? (v as T) : fail('CATALOG_INVALID', `${what}.${key} must be one of ${allowed.join(', ')}.`);
};
/** Rejects any external reference or executable content anywhere in the tree. */
export function assertSafeData(value: unknown, path = 'catalog', depth = 0): void {
  if (depth > 16) return fail('CATALOG_INVALID', `${path} nests too deeply.`);
  if (typeof value === 'string') { if (UNSAFE_TEXT.test(value)) fail('ASSET_UNSAFE', `${path} contains an external reference or script.`); return; }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('CATALOG_INVALID', `${path} must be finite.`); return; }
  if (Array.isArray(value)) { value.forEach((item, i) => assertSafeData(item, `${path}[${i}]`, depth + 1)); return; }
  if (typeof value !== 'object') return fail('CATALOG_INVALID', `${path} has an unsupported value.`);
  for (const [key, item] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key.toLowerCase())) fail('ASSET_UNSAFE', `${path}.${key} is not an allowed field.`);
    assertSafeData(item, `${path}.${key}`, depth + 1);
  }
}
function parameterSchema(value: unknown, id: string): ParameterSchema {
  const what = `${id}.parameterSchema`, schema = closed(value, ['type', 'additionalProperties', 'properties'], [], what);
  if (schema.type !== 'object' || schema.additionalProperties !== false) fail('CATALOG_INVALID', `${what} must be a closed object schema.`);
  const raw = schema.properties;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('CATALOG_INVALID', `${what}.properties must be an object.`);
  const entries = Object.entries(raw as Raw), properties: Record<string, NumberParameter> = {};
  if (entries.length > 32) fail('CATALOG_INVALID', `${what} declares too many parameters.`);
  for (const [name, spec] of entries) {
    if (!/^[a-z][A-Za-z0-9]{0,31}$/.test(name)) fail('CATALOG_INVALID', `${what} parameter ${name} has an invalid name.`);
    const p = closed(spec, ['type', 'minimum', 'maximum', 'default', 'description'], [], `${what}.${name}`);
    if (p.type !== 'number') fail('CATALOG_INVALID', `${what}.${name} must be numeric.`);
    const minimum = num(p, 'minimum', name), maximum = num(p, 'maximum', name), value = num(p, 'default', name);
    if (minimum > maximum) fail('CATALOG_INVALID', `${what}.${name} has inverted bounds.`);
    if (value < minimum || value > maximum) fail('PARAMETER_OUT_OF_RANGE', `${what}.${name} default is outside its bounds.`);
    properties[name] = { type: 'number', minimum, maximum, default: value, description: str(p, 'description', 512, name) };
  }
  return { type: 'object', additionalProperties: false, properties };
}
function polygon(value: unknown, what: string): Polygon {
  if (!isPolygon(value)) return fail('CATALOG_MISSING_GEOMETRY', `${what} needs 3 to 64 finite vertices.`);
  if (!isSimple(value)) return fail('COLLISION_SELF_INTERSECTING', `${what} intersects itself.`);
  if (!isConvex(value)) return fail('COLLISION_NONCONVEX', `${what} is not convex; only convex collision polygons are supported.`);
  return value.map(([x, y]) => [x, y]);
}
function collision(value: unknown, id: string): Collision {
  const what = `${id}.collision`;
  if (value === undefined || value === null) return fail('CATALOG_MISSING_GEOMETRY', `${id} has no collision definition.`);
  const c = closed(value, ['shape', 'heightFromParam'], ['extentsFromParams', 'footprintM', 'zMinFromParam'], what);
  const heightFromParam = str(c, 'heightFromParam', 32, what);
  const zMin = c.zMinFromParam === undefined ? {} : { zMinFromParam: str(c, 'zMinFromParam', 32, what) };
  if (c.shape === 'box') {
    if (c.extentsFromParams === undefined) fail('CATALOG_MISSING_GEOMETRY', `${what} box needs extentsFromParams.`);
    if (c.footprintM !== undefined) fail('CATALOG_INVALID', `${what} box cannot also declare a polygon footprint.`);
    const e = closed(c.extentsFromParams, ['lengthM', 'widthM'], [], `${what}.extentsFromParams`);
    return { shape: 'box', extentsFromParams: { lengthM: str(e, 'lengthM', 32, what), widthM: str(e, 'widthM', 32, what) }, heightFromParam, ...zMin };
  }
  if (c.shape === 'convex-polygon') {
    if (c.extentsFromParams !== undefined) fail('CATALOG_INVALID', `${what} polygon cannot also declare box extents.`);
    return { shape: 'convex-polygon', footprintM: polygon(c.footprintM, `${what}.footprintM`), heightFromParam, ...zMin };
  }
  return fail('COLLISION_NONCONVEX', `${what} shape ${String(c.shape)} is unsupported; use box or convex-polygon.`);
}
function robot(value: unknown, id: string, body: Polygon): RobotSpec {
  const what = `${id}.robot`;
  const r = closed(value, ['drive', 'loadedFootprintM', 'maxSpeedMps', 'maxAngularRadps', 'accelerationMps2', 'decelerationMps2', 'reverse', 'driveOriginOffsetM', 'loadOffsetM'], [], what);
  const positive = (key: string): number => { const v = num(r, key, what); return v > 0 ? v : fail('PARAMETER_OUT_OF_RANGE', `${what}.${key} must be positive.`); };
  if (typeof r.reverse !== 'boolean') fail('CATALOG_INVALID', `${what}.reverse must be boolean.`);
  const origin = r.driveOriginOffsetM, load = r.loadOffsetM;
  if (!isPoint(origin) || !isPoint(load)) return fail('CATALOG_INVALID', `${what} offsets must be finite [x, y].`);
  const loaded = polygon(r.loadedFootprintM, `${what}.loadedFootprintM`);
  if (!containsPolygon(loaded, body)) fail('LOADED_FOOTPRINT_INVALID', `${what} loaded footprint must contain the body footprint.`);
  return {
    drive: oneOf(r, 'drive', ['differential', 'omnidirectional'], what), loadedFootprintM: loaded,
    maxSpeedMps: positive('maxSpeedMps'), maxAngularRadps: positive('maxAngularRadps'), accelerationMps2: positive('accelerationMps2'), decelerationMps2: positive('decelerationMps2'),
    reverse: r.reverse === true, driveOriginOffsetM: [origin[0], origin[1]], loadOffsetM: [load[0], load[1]],
  };
}
export function validateEntry(value: unknown): CatalogEntry {
  assertSafeData(value, 'entry');
  const e = closed(value, ['id', 'version', 'kind', 'title', 'description', 'note', 'parameterSchema', 'collision', 'display', 'exportProfiles', 'license', 'sha256'], ['robot']);
  const id = str(e, 'id', 64, 'entry');
  if (!ID.test(id)) fail('CATALOG_INVALID', 'Entry id must be a lowercase slug.');
  const version = str(e, 'version', 32, id);
  if (!VERSION.test(version)) fail('CATALOG_INVALID', `${id} version must be semantic.`);
  const schema = parameterSchema(e.parameterSchema, id), c = collision(e.collision, id);
  if (e.display === undefined || e.display === null) fail('CATALOG_MISSING_GEOMETRY', `${id} has no display definition.`);
  const d = closed(e.display, ['primitive', 'materialId'], [], `${id}.display`);
  const isaac = closed(closed(e.exportProfiles, ['isaac'], [], `${id}.exportProfiles`).isaac, ['usdPrimType', 'notes'], [], `${id}.exportProfiles.isaac`);
  const license = closed(e.license, ['spdx', 'source'], [], `${id}.license`);
  const entry: CatalogEntry = {
    id, version, kind: oneOf(e, 'kind', ['object', 'assembly'], id), title: str(e, 'title', 128, id), description: str(e, 'description', 2048, id), note: str(e, 'note', 2048, id),
    parameterSchema: schema, collision: c, display: { primitive: oneOf(d, 'primitive', ['box', 'cylinder', 'extrusion'], id), materialId: str(d, 'materialId', 64, id) },
    exportProfiles: { isaac: { usdPrimType: oneOf(isaac, 'usdPrimType', ['Cube', 'Cylinder', 'Xform'], id), notes: str(isaac, 'notes', 1024, id) } },
    license: { spdx: str(license, 'spdx', 64, `${id}.license`), source: str(license, 'source', 256, `${id}.license`) }, sha256: '',
  };
  const body = footprintFor(entry);
  heightIntervalFor(entry);
  if (e.robot !== undefined) {
    if (c.shape !== 'convex-polygon') fail('CATALOG_INVALID', `${id} robots need a convex-polygon body footprint.`);
    entry.robot = robot(e.robot, id, body);
  }
  const sha256 = str(e, 'sha256', 64, id);
  if (!HASH.test(sha256)) fail('CATALOG_INVALID', `${id} sha256 must be 64 hex characters.`);
  const { sha256: _ignored, ...unhashed } = e;
  if (hashJson(unhashed) !== sha256) fail('ASSET_HASH_MISMATCH', `${id} content hash does not match its entry.`);
  entry.sha256 = sha256;
  return entry;
}
export function validateCatalog(value: unknown): Catalog {
  const c = closed(value, ['formatVersion', 'entries'], [], 'catalog');
  const rows = c.entries;
  if (c.formatVersion !== '1.0.0' || !Array.isArray(rows) || rows.length > 10_000) return fail('CATALOG_INVALID', 'Catalog needs formatVersion 1.0.0 and a bounded entries array.');
  const seen = new Set<string>(), entries: CatalogEntry[] = [];
  for (const raw of rows as unknown[]) {
    const entry = validateEntry(raw), key = `${entry.id}@${entry.version}`;
    if (seen.has(key)) fail('CATALOG_DUPLICATE_ID', `Duplicate catalog entry ${key}.`);
    seen.add(key);
    entries.push(entry);
  }
  return { formatVersion: '1.0.0', entries };
}
/** Hash of an entry body (without sha256), used to author and verify entries. */
export const entryHash = (entry: Omit<CatalogEntry, 'sha256'> & { sha256?: string }): string => { const { sha256: _ignored, ...body } = entry; return hashJson(body); };
export function catalogEntry(catalog: Catalog, id: string, version: string): CatalogEntry {
  return catalog.entries.find((entry) => entry.id === id && entry.version === version) ?? fail('ASSET_UNKNOWN', `Catalog has no entry ${id}@${version}.`);
}
export const assetRefFor = (entry: CatalogEntry): AssetRef => ({ id: entry.id, version: entry.version, sha256: entry.sha256 });
let cached: Catalog | undefined;
/** The bundled reviewed catalog, validated once on first use. */
export function bundledCatalog(): Catalog { return (cached ??= validateCatalog(bundled)); }
