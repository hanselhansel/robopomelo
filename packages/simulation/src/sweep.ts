import type { Pose } from '@robopomelo/spec';
import type { Polygon, StaticObstacle, SweepResult, Tolerances, Vec2, ZInterval } from './types.js';

/** Projections separated by less than this are treated as touching, not overlapping. */
const SAT_EPS = 1e-9;

/** Rotates a footprint by the pose yaw about the footprint origin, then translates.
 * Footprints are expressed relative to the drive origin, so the pose point is the
 * pivot for every rotation. */
export function transformPolygon(polygon: Polygon, pose: Pose): Polygon {
  const c = Math.cos(pose.yawRad), s = Math.sin(pose.yawRad);
  return polygon.map(([x, y]) => [pose.xM + x * c - y * s, pose.yM + x * s + y * c]);
}

const cross = (o: Vec2, a: Vec2, b: Vec2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Andrew's monotone chain. Counter-clockwise, no collinear points, deterministic. */
export function convexHull(points: readonly Vec2[]): Polygon {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const half = (input: readonly Vec2[]): Vec2[] => {
    const out: Vec2[] = [];
    for (const p of input) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** Conservative inflation: Minkowski sum with an axis-aligned square of half-width
 * `byM`, which contains the disc of radius `byM`. */
export function inflate(polygon: Polygon, byM: number): Polygon {
  if (byM <= 0) return polygon;
  return convexHull(polygon.flatMap(([x, y]): Vec2[] => [[x - byM, y - byM], [x + byM, y - byM], [x + byM, y + byM], [x - byM, y + byM]]));
}

export function circumradius(polygon: Polygon): number {
  let r = 0;
  for (const [x, y] of polygon) r = Math.max(r, Math.hypot(x, y));
  return r;
}

function project(polygon: Polygon, nx: number, ny: number): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const [x, y] of polygon) {
    const d = x * nx + y * ny;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

function separatedByEdges(a: Polygon, b: Polygon): boolean {
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!, q = a[(i + 1) % a.length]!;
    const nx = q[1] - p[1], ny = p[0] - q[0];
    const len = Math.hypot(nx, ny);
    if (len === 0) continue;
    const [aMin, aMax] = project(a, nx / len, ny / len);
    const [bMin, bMax] = project(b, nx / len, ny / len);
    if (aMax <= bMin + SAT_EPS || bMax <= aMin + SAT_EPS) return true;
  }
  return false;
}

/** Separating-axis test for two convex polygons. Touching edges do not overlap. */
export function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return !separatedByEdges(a, b) && !separatedByEdges(b, a);
}

/** Swept area of a convex footprint under pure translation: the hull of the start
 * and end placements (exact), inflated by `sweepBoundM` so every check carries the
 * same stated conservative tolerance as rotations and the trace checker. */
export function sweepTranslation(footprint: Polygon, from: Pose, to: Pose, tolerances: Tolerances): Polygon[] {
  return [inflate(convexHull([...transformPolygon(footprint, from), ...transformPolygon(footprint, { ...to, yawRad: from.yawRad })]), tolerances.sweepBoundM)];
}

/** Footprint standing at a pose, inflated by the stated tolerance. */
export function standingPolygon(footprint: Polygon, pose: Pose, tolerances: Tolerances): Polygon {
  return inflate(transformPolygon(footprint, pose), tolerances.sweepBoundM);
}

/** Angular step whose sagitta on the footprint circumradius stays within the bound. */
export function rotationSubdivisions(footprint: Polygon, dYawRad: number, tolerances: Tolerances): number {
  const r = circumradius(footprint);
  if (r === 0 || dYawRad === 0) return 1;
  const ratio = 1 - tolerances.sweepBoundM / r;
  if (ratio <= -1) return 1;
  const maxStep = 2 * Math.acos(Math.max(-1, ratio));
  return maxStep <= 0 ? Infinity : Math.max(1, Math.ceil(Math.abs(dYawRad) / maxStep));
}

/** Conservative swept area of an in-place rotation about the pose point. The
 * rotation is subdivided until the chord error at the circumradius is at most
 * `sweepBoundM`; each segment is the hull of its two bounding footprints inflated
 * by that bound, so the union contains the true swept area. Returns unresolved
 * when `maxSubdivisions` cannot reach the bound. */
export function sweepRotation(footprint: Polygon, pose: Pose, dYawRad: number, tolerances: Tolerances): SweepResult {
  const n = rotationSubdivisions(footprint, dYawRad, tolerances);
  if (!Number.isFinite(n) || n > tolerances.maxSubdivisions) return { resolved: false, reason: 'SUBDIVISION_LIMIT' };
  const polygons: Polygon[] = [];
  let previous = transformPolygon(footprint, pose);
  for (let i = 1; i <= n; i++) {
    const next = transformPolygon(footprint, { ...pose, yawRad: pose.yawRad + (dYawRad * i) / n });
    polygons.push(inflate(convexHull([...previous, ...next]), tolerances.sweepBoundM));
    previous = next;
  }
  return { resolved: true, polygons };
}

export const zIntersects = (a: ZInterval, b: ZInterval): boolean => a.zMinM < b.zMaxM - SAT_EPS && b.zMinM < a.zMaxM - SAT_EPS;

export type CollisionResult = { hit: false } | { hit: true; obstacleId: string; polygonIndex: number };

/** Checks every swept polygon against every obstacle whose height interval meets
 * the robot's. Never an endpoint-only shortcut: the caller passes the full sweep. */
export function collides(swept: readonly Polygon[], z: ZInterval, obstacles: readonly StaticObstacle[]): CollisionResult {
  for (const obstacle of obstacles) {
    if (!zIntersects(z, obstacle)) continue;
    for (let i = 0; i < swept.length; i++) if (polygonsOverlap(swept[i]!, obstacle.polygon)) return { hit: true, obstacleId: obstacle.id, polygonIndex: i };
  }
  return { hit: false };
}
