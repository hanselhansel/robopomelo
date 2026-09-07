import type { Pose } from '@robopomelo/spec';
import { assertSafeData, catalogEntry, type Catalog, type Display, type NumberParameter, type ParameterSchema } from './catalog.js';
import type { CollisionVolume } from './compile.js';
import { footprintFor, heightIntervalFor, isConvex, isPolygon, isPose, isSimple, resolveParameters, transformPolygon, type Bounds, type Polygon } from './geometry.js';
import { SpatialError } from './hash.js';
/** Closed geometry recipe grammar. Recipes are data interpreted by this trusted
 * compiler: parameterized catalog references, transforms, groups, convex
 * extrusions with a material, and named sub-assemblies. No scripts, meshes or
 * external URLs; anything outside the grammar is an explicit unsupported error. */
export type RecipeNode =
  | { kind: 'catalog-ref'; componentId?: string; id: string; version: string; params: Record<string, number> }
  | { kind: 'transform'; componentId?: string; pose: Pose; child: RecipeNode }
  | { kind: 'group'; componentId?: string; children: RecipeNode[] }
  | { kind: 'extrusion'; componentId?: string; polygon: Polygon; heightM: number; materialId: string }
  | { kind: 'sub-assembly'; componentId?: string; name: string };
export type AssemblyRecipe = { id: string; version: string; title: string; parameterSchema?: ParameterSchema; subAssemblies: Record<string, RecipeNode>; root: RecipeNode };
export type RecipePrimitive = { componentId: string | null; primitive: Display['primitive']; materialId: string; polygon: Polygon; zMinM: number; zMaxM: number };
export type CompiledRecipe = { collision: CollisionVolume[]; display: RecipePrimitive[]; componentIds: string[]; bounds: Bounds; nodes: number; vertices: number };
export const RECIPE_LIMITS = Object.freeze({ nodes: 200, depth: 8, vertices: 2000 });
export const EXTRUSION_VERTEX_LIMIT = 32;
const NODE_KINDS = ['catalog-ref', 'transform', 'group', 'extrusion', 'sub-assembly'] as const;
const ID = /^[a-z][a-z0-9-]{0,63}$/, VERSION = /^\d+\.\d+\.\d+$/, MAX_HEIGHT_M = 100;
type Raw = Record<string, unknown>;
const fail = (code: string, message: string): never => { throw new SpatialError(code, message); };
const IDENTITY: Pose = { xM: 0, yM: 0, zM: 0, yawRad: 0 };
const compose = (outer: Pose, inner: Pose): Pose => {
  const c = Math.cos(outer.yawRad), s = Math.sin(outer.yawRad);
  return { xM: outer.xM + inner.xM * c - inner.yM * s, yM: outer.yM + inner.xM * s + inner.yM * c, zM: outer.zM + inner.zM, yawRad: outer.yawRad + inner.yawRad };
};
function closed(value: unknown, required: string[], optional: string[], what: string): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('RECIPE_INVALID', `${what} must be an object.`);
  const record = value as Raw;
  for (const key of required) if (!Object.hasOwn(record, key)) fail('RECIPE_INVALID', `${what} is missing ${key}.`);
  for (const key of Object.keys(record)) if (!required.includes(key) && !optional.includes(key)) fail('RECIPE_INVALID', `${what} has unknown field ${key}.`);
  return record;
}
function parameterSchema(value: unknown, what: string): ParameterSchema {
  const schema = closed(value, ['type', 'additionalProperties', 'properties'], [], what);
  if (schema.type !== 'object' || schema.additionalProperties !== false || !schema.properties || typeof schema.properties !== 'object') fail('RECIPE_INVALID', `${what} must be a closed object schema.`);
  const properties: Record<string, NumberParameter> = {};
  for (const [name, spec] of Object.entries(schema.properties as Raw)) {
    if (!/^[a-z][A-Za-z0-9]{0,31}$/.test(name)) fail('RECIPE_INVALID', `${what} parameter ${name} has an invalid name.`);
    const p = closed(spec, ['type', 'minimum', 'maximum', 'default', 'description'], [], `${what}.${name}`);
    const [minimum, maximum, value] = [p.minimum, p.maximum, p.default].map((n) => (typeof n === 'number' && Number.isFinite(n) ? n : fail('RECIPE_INVALID', `${what}.${name} bounds must be finite.`))) as number[];
    if (minimum! > maximum! || value! < minimum! || value! > maximum!) fail('PARAMETER_OUT_OF_RANGE', `${what}.${name} default is outside its bounds.`);
    if (p.type !== 'number' || typeof p.description !== 'string') fail('RECIPE_INVALID', `${what}.${name} must be a described number.`);
    properties[name] = { type: 'number', minimum: minimum!, maximum: maximum!, default: value!, description: String(p.description) };
  }
  return { type: 'object', additionalProperties: false, properties };
}
type Walk = { catalog: Catalog; subs: Record<string, RecipeNode>; ids: Set<string>; nodes: number; vertices: number; stack: string[] };
function componentId(record: Raw, walk: Walk, what: string): string | undefined {
  if (record.componentId === undefined) return undefined;
  if (typeof record.componentId !== 'string' || !ID.test(record.componentId)) return fail('RECIPE_INVALID', `${what}.componentId must be a lowercase slug.`);
  if (walk.ids.has(record.componentId)) fail('RECIPE_DUPLICATE_ID', `Component id ${record.componentId} repeats.`);
  walk.ids.add(record.componentId);
  return record.componentId;
}
/** Validates one node and every expansion below it. Depth counts expanded
 * sub-assemblies, so cycles are caught by both the stack and the depth limit. */
function node(value: unknown, walk: Walk, depth: number, what: string): RecipeNode {
  if (depth > RECIPE_LIMITS.depth) fail('RECIPE_TOO_DEEP', `${what} nests deeper than ${RECIPE_LIMITS.depth} levels.`);
  if (++walk.nodes > RECIPE_LIMITS.nodes) fail('RECIPE_TOO_LARGE', `Recipe expands to more than ${RECIPE_LIMITS.nodes} nodes.`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('RECIPE_INVALID', `${what} must be a node object.`);
  // Safety is checked per node (children excluded) so the grammar's own depth limit reports first.
  const { child: _child, children: _children, ...own } = value as Raw;
  assertSafeData(own, what);
  const kind = (value as Raw).kind;
  if (!NODE_KINDS.includes(kind as (typeof NODE_KINDS)[number])) fail('RECIPE_UNSUPPORTED', `${what}.kind ${String(kind)} is not part of the recipe grammar; supported kinds are ${NODE_KINDS.join(', ')}.`);
  switch (kind as (typeof NODE_KINDS)[number]) {
    case 'catalog-ref': {
      const r = closed(value, ['kind', 'id', 'version', 'params'], ['componentId'], what), cid = componentId(r, walk, what);
      if (typeof r.id !== 'string' || typeof r.version !== 'string') return fail('RECIPE_INVALID', `${what} needs a catalog id and version.`);
      const entry = catalogEntry(walk.catalog, r.id, r.version);
      if (!r.params || typeof r.params !== 'object' || Array.isArray(r.params)) fail('RECIPE_INVALID', `${what}.params must be an object.`);
      const params = resolveParameters(entry, r.params as Record<string, number>);
      walk.vertices += footprintFor(entry, params).length;
      return { kind: 'catalog-ref', ...(cid ? { componentId: cid } : {}), id: entry.id, version: entry.version, params: { ...(r.params as Record<string, number>) } };
    }
    case 'transform': {
      const r = closed(value, ['kind', 'pose', 'child'], ['componentId'], what), cid = componentId(r, walk, what);
      if (!isPose(r.pose)) fail('POSE_INVALID', `${what}.pose needs finite xM, yM, zM and yawRad.`);
      return { kind: 'transform', ...(cid ? { componentId: cid } : {}), pose: { ...(r.pose as Pose) }, child: node(r.child, walk, depth + 1, `${what}.child`) };
    }
    case 'group': {
      const r = closed(value, ['kind', 'children'], ['componentId'], what), cid = componentId(r, walk, what);
      if (!Array.isArray(r.children) || r.children.length === 0) fail('RECIPE_INVALID', `${what}.children must be a non-empty array.`);
      return { kind: 'group', ...(cid ? { componentId: cid } : {}), children: (r.children as unknown[]).map((child, i) => node(child, walk, depth + 1, `${what}.children[${i}]`)) };
    }
    case 'extrusion': {
      const r = closed(value, ['kind', 'polygon', 'heightM', 'materialId'], ['componentId'], what), cid = componentId(r, walk, what);
      if (!isPolygon(r.polygon) || r.polygon.length > EXTRUSION_VERTEX_LIMIT) fail('RECIPE_INVALID', `${what}.polygon needs 3 to ${EXTRUSION_VERTEX_LIMIT} finite vertices.`);
      const polygon = r.polygon as Polygon;
      if (!isSimple(polygon) || !isConvex(polygon)) fail('COLLISION_NONCONVEX', `${what}.polygon must be a simple convex polygon.`);
      const heightM = typeof r.heightM === 'number' && r.heightM > 0 && r.heightM <= MAX_HEIGHT_M ? r.heightM : fail('PARAMETER_OUT_OF_RANGE', `${what}.heightM must be in (0, ${MAX_HEIGHT_M}] meters.`);
      const materialId = typeof r.materialId === 'string' && ID.test(r.materialId) ? r.materialId : fail('RECIPE_INVALID', `${what}.materialId must be a lowercase slug.`);
      walk.vertices += polygon.length;
      return { kind: 'extrusion', ...(cid ? { componentId: cid } : {}), polygon: polygon.map(([x, y]) => [x, y]), heightM, materialId };
    }
    case 'sub-assembly': {
      const r = closed(value, ['kind', 'name'], ['componentId'], what), cid = componentId(r, walk, what);
      if (typeof r.name !== 'string' || !Object.hasOwn(walk.subs, r.name)) return fail('RECIPE_INVALID', `${what} references unknown sub-assembly ${String(r.name)}.`);
      if (walk.stack.includes(r.name)) fail('RECIPE_CYCLE', `Sub-assembly ${[...walk.stack, r.name].join(' -> ')} references itself.`);
      // Expansion counts nodes, vertices and depth against the whole recipe; component ids are unique per definition.
      const expansion: Walk = { ...walk, ids: new Set(), stack: [...walk.stack, r.name] };
      node(walk.subs[r.name], expansion, depth + 1, `subAssemblies.${r.name}`);
      walk.nodes = expansion.nodes; walk.vertices = expansion.vertices;
      return { kind: 'sub-assembly', ...(cid ? { componentId: cid } : {}), name: r.name };
    }
  }
}
export function validateRecipe(value: unknown, catalog: Catalog): AssemblyRecipe {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('RECIPE_INVALID', 'A recipe must be an object.');
  const { root: _root, subAssemblies: _subs, ...head } = value as Raw;
  assertSafeData(head, 'recipe');
  const r = closed(value, ['id', 'version', 'title', 'subAssemblies', 'root'], ['parameterSchema'], 'recipe');
  const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : fail('RECIPE_INVALID', 'Recipe id must be a lowercase slug.');
  const version = typeof r.version === 'string' && VERSION.test(r.version) ? r.version : fail('RECIPE_INVALID', 'Recipe version must be semantic.');
  const title = typeof r.title === 'string' && r.title.trim() && r.title.length <= 128 ? r.title : fail('RECIPE_INVALID', 'Recipe title must be 1 to 128 characters.');
  if (!r.subAssemblies || typeof r.subAssemblies !== 'object' || Array.isArray(r.subAssemblies)) fail('RECIPE_INVALID', 'subAssemblies must be an object.');
  const subs = r.subAssemblies as Record<string, RecipeNode>;
  for (const name of Object.keys(subs)) if (!ID.test(name)) fail('RECIPE_INVALID', `Sub-assembly name ${name} must be a lowercase slug.`);
  if (Object.keys(subs).length > RECIPE_LIMITS.nodes) fail('RECIPE_TOO_LARGE', 'Too many sub-assemblies.');
  const walk: Walk = { catalog, subs, ids: new Set(), nodes: 0, vertices: 0, stack: [] };
  const root = node(r.root, walk, 1, 'root');
  // Unreferenced sub-assemblies must still be valid on their own.
  const validated: Record<string, RecipeNode> = {};
  for (const [name, sub] of Object.entries(subs)) {
    const scoped: Walk = { ...walk, ids: new Set(), nodes: 0, vertices: 0, stack: [name] };
    validated[name] = node(sub, scoped, 1, `subAssemblies.${name}`);
  }
  if (walk.vertices > RECIPE_LIMITS.vertices) fail('RECIPE_TOO_MANY_VERTICES', `Recipe expands to ${walk.vertices} vertices; the limit is ${RECIPE_LIMITS.vertices}.`);
  const schema = r.parameterSchema === undefined ? {} : { parameterSchema: parameterSchema(r.parameterSchema, 'recipe.parameterSchema') };
  return { id, version, title, ...schema, subAssemblies: validated, root };
}
/** Expands a validated recipe into collision volumes and display primitives in
 * local meters. Collision derives only from catalog collision definitions and
 * extrusion polygons, never from display data. */
export function compileRecipe(recipe: AssemblyRecipe, catalog: Catalog): CompiledRecipe {
  const collision: CollisionVolume[] = [], display: RecipePrimitive[] = [], componentIds: string[] = [];
  let nodes = 0, vertices = 0;
  const path = (prefix: string | null, id?: string): string | null => (id ? (prefix ? `${prefix}/${id}` : id) : prefix);
  const emit = (polygon: Polygon, z: { zMinM: number; zMaxM: number }, pose: Pose, materialId: string, primitive: Display['primitive'], id: string | null) => {
    const world = transformPolygon(polygon, pose), volume = { polygon: world, zMinM: pose.zM + z.zMinM, zMaxM: pose.zM + z.zMaxM };
    collision.push(volume);
    display.push({ componentId: id, primitive, materialId, polygon: world.map(([x, y]) => [x, y]), zMinM: volume.zMinM, zMaxM: volume.zMaxM });
    if (id) componentIds.push(id);
    vertices += polygon.length;
  };
  const visit = (n: RecipeNode, pose: Pose, prefix: string | null, depth: number): void => {
    if (++nodes > RECIPE_LIMITS.nodes || depth > RECIPE_LIMITS.depth) fail('RECIPE_TOO_LARGE', 'Recipe exceeds its expansion limits.');
    const id = path(prefix, n.componentId);
    switch (n.kind) {
      case 'catalog-ref': {
        const entry = catalogEntry(catalog, n.id, n.version), params = resolveParameters(entry, n.params);
        return emit(footprintFor(entry, params), heightIntervalFor(entry, params), pose, entry.display.materialId, entry.display.primitive, id);
      }
      case 'extrusion': return emit(n.polygon, { zMinM: 0, zMaxM: n.heightM }, pose, n.materialId, 'extrusion', id);
      case 'transform': return visit(n.child, compose(pose, n.pose), id, depth + 1);
      case 'group': for (const child of n.children) visit(child, pose, id, depth + 1); return;
      case 'sub-assembly': return visit(recipe.subAssemblies[n.name] ?? fail('RECIPE_INVALID', `Unknown sub-assembly ${n.name}.`), pose, id, depth + 1);
    }
  };
  visit(recipe.root, IDENTITY, null, 1);
  const xs = collision.flatMap((c) => c.polygon.map((p) => p[0])), ys = collision.flatMap((c) => c.polygon.map((p) => p[1]));
  const bounds: Bounds = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  return { collision, display, componentIds, bounds, nodes, vertices };
}
/** Fixture: a four-bay rack row composed from reviewed rack-bay references. */
export const RACK_ROW_RECIPE: AssemblyRecipe = Object.freeze({
  id: 'rack-row-composed', version: '1.0.0', title: 'Rack row of four bays',
  subAssemblies: { bay: { kind: 'catalog-ref', componentId: 'bay', id: 'rack-bay', version: '1.0.0', params: {} } },
  root: {
    kind: 'group',
    children: [-4.05, -1.35, 1.35, 4.05].map((xM, i) => ({ kind: 'transform' as const, componentId: `bay-${i + 1}`, pose: { xM, yM: 0, zM: 0, yawRad: 0 }, child: { kind: 'sub-assembly' as const, name: 'bay' } })),
  },
}) as AssemblyRecipe;
