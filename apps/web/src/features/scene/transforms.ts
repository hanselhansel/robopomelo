import type { Pose, Scene } from '@robopomelo/spec';
import type { CompiledObject, Point, Polygon } from '@robopomelo/spatial';
/** Pure geometry helpers for the editor. World units are meters and radians,
 * right-handed Z-up; screen units are CSS pixels with Y pointing down. */
export type Snap = { positionM: number; angleRad: number };
export type Viewport = { width: number; height: number };
export type TopDownCamera = { centerX: number; centerY: number; pxPerM: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export const DEFAULT_SNAP: Snap = { positionM: 0.05, angleRad: (5 * Math.PI) / 180 };
const clean = (value: number): number => Number(value.toFixed(6));
export const snapValue = (value: number, step: number): number => (step > 0 ? clean(Math.round(value / step) * step) : clean(value));
export function normalizeYaw(yawRad: number): number {
  const turn = 2 * Math.PI;
  let yaw = yawRad % turn;
  if (yaw <= -Math.PI) yaw += turn;
  if (yaw > Math.PI) yaw -= turn;
  return yaw === -0 ? 0 : yaw;
}
export const snapPose = (pose: Pose, snap: Snap): Pose => ({
  xM: snapValue(pose.xM, snap.positionM),
  yM: snapValue(pose.yM, snap.positionM),
  zM: snapValue(pose.zM, snap.positionM),
  yawRad: normalizeYaw(snapValue(pose.yawRad, snap.angleRad)),
});
/** Returns a finite pose with normalized yaw, or null when any part is not a finite number. */
export function validatePose(pose: Pose): Pose | null {
  const values = [pose.xM, pose.yM, pose.zM, pose.yawRad];
  if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  return { xM: pose.xM, yM: pose.yM, zM: pose.zM, yawRad: normalizeYaw(pose.yawRad) };
}
export const samePose = (a: Pose, b: Pose): boolean => a.xM === b.xM && a.yM === b.yM && a.zM === b.zM && a.yawRad === b.yawRad;
/** Floor rectangle: the floor spans [0, lengthM] x [0, widthM] from the scene origin. */
export function floorBounds(floor: Scene['floor']): Bounds | null {
  if (floor.state !== 'known' && floor.state !== 'unverified') return null;
  return { minX: 0, minY: 0, maxX: floor.value.lengthM, maxY: floor.value.widthM };
}
export function polygonBounds(polygon: Polygon): Bounds {
  const xs = polygon.map((p) => p[0]), ys = polygon.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
const union = (a: Bounds, b: Bounds): Bounds => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) });
/** Bounds of the floor and every compiled footprint, used by Fit layout. */
export function sceneBounds(objects: readonly CompiledObject[], floor: Scene['floor']): Bounds {
  let bounds = floorBounds(floor);
  for (const object of objects) {
    const box = polygonBounds(object.collision.polygon);
    bounds = bounds ? union(bounds, box) : box;
  }
  return bounds ?? { minX: -5, minY: -5, maxX: 5, maxY: 5 };
}
export function fitCamera(bounds: Bounds, viewport: Viewport, paddingPx = 32): TopDownCamera {
  const spanX = Math.max(bounds.maxX - bounds.minX, 0.5), spanY = Math.max(bounds.maxY - bounds.minY, 0.5);
  const usableW = Math.max(viewport.width - 2 * paddingPx, 1), usableH = Math.max(viewport.height - 2 * paddingPx, 1);
  return { centerX: (bounds.minX + bounds.maxX) / 2, centerY: (bounds.minY + bounds.maxY) / 2, pxPerM: Math.min(usableW / spanX, usableH / spanY) };
}
export const worldToScreen = ([x, y]: Point, camera: TopDownCamera, viewport: Viewport): Point => [
  viewport.width / 2 + (x - camera.centerX) * camera.pxPerM,
  viewport.height / 2 - (y - camera.centerY) * camera.pxPerM,
];
export const screenToWorld = ([sx, sy]: Point, camera: TopDownCamera, viewport: Viewport): Point => [
  camera.centerX + (sx - viewport.width / 2) / camera.pxPerM,
  camera.centerY - (sy - viewport.height / 2) / camera.pxPerM,
];
/** Inverse of the compiler's rigid transform: world polygon back to the object frame. */
export function localPolygon(object: CompiledObject): Polygon {
  const { xM, yM, yawRad } = object.display.pose, c = Math.cos(-yawRad), s = Math.sin(-yawRad);
  return object.collision.polygon.map(([x, y]) => { const dx = x - xM, dy = y - yM; return [clean(dx * c - dy * s), clean(dx * s + dy * c)] as Point; });
}
export function transformPolygon(polygon: Polygon, pose: Pose): Polygon {
  const c = Math.cos(pose.yawRad), s = Math.sin(pose.yawRad);
  return polygon.map(([x, y]) => [pose.xM + x * c - y * s, pose.yM + x * s + y * c] as Point);
}
/** Separating-axis overlap test for convex footprints; touching edges do not count. */
export function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!;
      const nx = q[1] - p[1], ny = p[0] - q[0];
      const project = (poly: Polygon) => poly.map(([x, y]) => x * nx + y * ny);
      const pa = project(a), pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
    }
  }
  return true;
}
/** Visual guide only: other objects whose footprints overlap the previewed placement. */
export function collidingIds(objects: readonly CompiledObject[], id: string, pose: Pose): string[] {
  const moving = objects.find((o) => o.instanceId === id);
  if (!moving) return [];
  const footprint = transformPolygon(localPolygon(moving), pose);
  const zMin = pose.zM + (moving.collision.zMinM - moving.display.pose.zM), zMax = pose.zM + (moving.collision.zMaxM - moving.display.pose.zM);
  return objects
    .filter((o) => o.instanceId !== id && o.collision.zMinM < zMax && o.collision.zMaxM > zMin && polygonsOverlap(footprint, o.collision.polygon))
    .map((o) => o.instanceId);
}
export const degrees = (rad: number): number => clean((rad * 180) / Math.PI);
export const radians = (deg: number): number => (deg * Math.PI) / 180;
