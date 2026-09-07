import type { Extents, Pose } from '@robopomelo/spec';
import type { CatalogEntry } from './catalog.js';
import { SpatialError } from './hash.js';
/** Planar geometry in canonical meters. Right-handed Z-up; yaw rotates about +Z
 * counterclockwise when viewed from above. Only convex simple polygons are
 * supported as collision shapes. */
export type Point = [number, number];
export type Polygon = Point[];
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
const EPS = 1e-12;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export const isPoint = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]);
export const isPolygon = (p: unknown): p is Polygon => Array.isArray(p) && p.length >= 3 && p.length <= 64 && p.every(isPoint);
const cross = (o: Point, a: Point, b: Point): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
/** Signed area (positive when counterclockwise). */
export function signedArea(polygon: Polygon): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}
export const area = (polygon: Polygon): number => Math.abs(signedArea(polygon));
/** Convex when every consecutive turn has the same orientation and the polygon
 * encloses a positive area. Collinear consecutive vertices are tolerated. */
export function isConvex(polygon: Polygon): boolean {
  if (!isPolygon(polygon) || area(polygon) <= EPS) return false;
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const c = cross(polygon[i]!, polygon[(i + 1) % polygon.length]!, polygon[(i + 2) % polygon.length]!);
    if (Math.abs(c) <= EPS) continue;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
  const on = (p: Point, q: Point, r: Point) => Math.abs(cross(p, q, r)) <= EPS && Math.min(p[0], q[0]) - EPS <= r[0] && r[0] <= Math.max(p[0], q[0]) + EPS && Math.min(p[1], q[1]) - EPS <= r[1] && r[1] <= Math.max(p[1], q[1]) + EPS;
  return on(c, d, a) || on(c, d, b) || on(a, b, c) || on(a, b, d);
}
/** Simple when no two non-adjacent edges touch and no vertex repeats. */
export function isSimple(polygon: Polygon): boolean {
  if (!isPolygon(polygon)) return false;
  const n = polygon.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
    if (Math.abs(polygon[i]![0] - polygon[j]![0]) <= EPS && Math.abs(polygon[i]![1] - polygon[j]![1]) <= EPS) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(polygon[i]!, polygon[(i + 1) % n]!, polygon[j]!, polygon[(j + 1) % n]!)) return false;
    }
  }
  return true;
}
export function bounds(polygon: Polygon): Bounds {
  if (!isPolygon(polygon)) throw new SpatialError('POLYGON_INVALID', 'A polygon needs 3 to 64 finite vertices.');
  const xs = polygon.map((p) => p[0]), ys = polygon.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
export const isPose = (pose: unknown): pose is Pose => !!pose && typeof pose === 'object' && (['xM', 'yM', 'zM', 'yawRad'] as const).every((k) => finite((pose as Record<string, unknown>)[k]));
export function transformPoint([x, y]: Point, pose: Pose): Point {
  const c = Math.cos(pose.yawRad), s = Math.sin(pose.yawRad);
  return [x * c - y * s + pose.xM, x * s + y * c + pose.yM];
}
export function transformPolygon(polygon: Polygon, pose: Pose): Polygon {
  if (!isPose(pose)) throw new SpatialError('POSE_INVALID', 'Pose needs finite xM, yM, zM and yawRad.');
  return polygon.map((p) => transformPoint(p, pose));
}
/** Every point of `inner` lies inside or on the convex `outer` polygon. */
export function containsPolygon(outer: Polygon, inner: Polygon): boolean {
  const orientation = Math.sign(signedArea(outer));
  return inner.every((p) => outer.every((a, i) => orientation * cross(a, outer[(i + 1) % outer.length]!, p) >= -EPS));
}
export const rectangle = (lengthM: number, widthM: number): Polygon => [[-lengthM / 2, -widthM / 2], [lengthM / 2, -widthM / 2], [lengthM / 2, widthM / 2], [-lengthM / 2, widthM / 2]];
/** Fills defaults, rejects unknown names and out-of-range values. */
export function resolveParameters(entry: CatalogEntry, params: Record<string, number> = {}): Record<string, number> {
  const schema = entry.parameterSchema.properties;
  for (const name of Object.keys(params)) if (!Object.hasOwn(schema, name)) throw new SpatialError('PARAMETER_UNKNOWN', `${entry.id} has no parameter ${name}.`);
  const resolved: Record<string, number> = {};
  for (const [name, spec] of Object.entries(schema)) {
    const value = Object.hasOwn(params, name) ? params[name]! : spec.default;
    if (!finite(value) || value < spec.minimum || value > spec.maximum) throw new SpatialError('PARAMETER_OUT_OF_RANGE', `${entry.id}.${name} must be a finite number in [${spec.minimum}, ${spec.maximum}].`);
    resolved[name] = value;
  }
  return resolved;
}
const param = (entry: CatalogEntry, resolved: Record<string, number>, name: string): number => {
  const value = resolved[name];
  if (value === undefined) throw new SpatialError('CATALOG_INVALID', `${entry.id} references undefined parameter ${name}.`);
  return value;
};
export function extentsFor(entry: CatalogEntry, params: Record<string, number> = {}): Extents {
  const r = resolveParameters(entry, params);
  return { lengthM: param(entry, r, 'lengthM'), widthM: param(entry, r, 'widthM'), heightM: param(entry, r, 'heightM') };
}
/** Collision footprint in local meters. Derived only from the collision
 * definition and the numeric parameters, never from display geometry. Fixed
 * convex polygons scale with lengthM/widthM relative to their defaults. */
export function footprintFor(entry: CatalogEntry, params: Record<string, number> = {}, options: { loaded?: boolean } = {}): Polygon {
  const r = resolveParameters(entry, params), collision = entry.collision;
  if (collision.shape === 'box') {
    if (options.loaded) throw new SpatialError('LOADED_FOOTPRINT_UNSUPPORTED', `${entry.id} is not a robot and has no loaded footprint.`);
    return rectangle(param(entry, r, collision.extentsFromParams.lengthM), param(entry, r, collision.extentsFromParams.widthM));
  }
  const source = options.loaded ? entry.robot?.loadedFootprintM : collision.footprintM;
  if (!source) throw new SpatialError('LOADED_FOOTPRINT_UNSUPPORTED', `${entry.id} is not a robot and has no loaded footprint.`);
  const schema = entry.parameterSchema.properties;
  const sx = schema.lengthM ? param(entry, r, 'lengthM') / schema.lengthM.default : 1;
  const sy = schema.widthM ? param(entry, r, 'widthM') / schema.widthM.default : 1;
  return source.map(([x, y]) => [x * sx, y * sy]);
}
/** Vertical interval [zMin, zMax] of the collision volume in local meters. */
export function heightIntervalFor(entry: CatalogEntry, params: Record<string, number> = {}): { zMinM: number; zMaxM: number } {
  const r = resolveParameters(entry, params), c = entry.collision;
  const zMinM = c.zMinFromParam ? param(entry, r, c.zMinFromParam) : 0, zMaxM = param(entry, r, c.heightFromParam);
  if (zMinM >= zMaxM) throw new SpatialError('PARAMETER_OUT_OF_RANGE', `${entry.id} collision base must be below its top.`);
  return { zMinM, zMaxM };
}
