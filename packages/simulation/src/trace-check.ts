import type { Pose, RobotProfile } from '@robopomelo/spec';
import { circumradius, collides, convexHull, inflate, transformPolygon } from './sweep.js';
import { robotZInterval, type MotionPrimitive, type PathStep, type Polygon, type RobotState, type StaticObstacle, type Tolerances } from './types.js';

const POSE_EPS = 1e-6;
/** Hard cap on samples for one transition; beyond it the step is unresolved. */
const MAX_SAMPLES = 100_000;

export type TraceVerdict =
  | { ok: true; steps: number; samples: number }
  | { ok: false; code: 'CONFLICT'; stepIndex: number; obstacleId: string }
  | { ok: false; code: 'POSE_MISMATCH' | 'TICK_ORDER' | 'UNRESOLVED'; stepIndex: number };

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const samePose = (a: Pose, b: Pose): boolean =>
  Math.abs(a.xM - b.xM) <= POSE_EPS && Math.abs(a.yM - b.yM) <= POSE_EPS && Math.abs(a.zM - b.zM) <= POSE_EPS && Math.abs(wrapAngle(a.yawRad - b.yawRad)) <= POSE_EPS;

/** Own footprint selection: the raw profile polygon hulled, independent of motion.ts. */
function footprintFor(profile: RobotProfile, loaded: boolean): Polygon {
  return convexHull((loaded ? profile.loadedFootprintM : profile.footprintM).map(([x, y]) => [x, y]));
}

/** Number of pose samples so that no footprint vertex moves more than the bound
 * between neighbours: translation by distance, rotation by arc at the circumradius. */
function sampleCount(footprint: Polygon, primitive: MotionPrimitive, boundM: number): number {
  const travel = primitive.kind === 'translate' ? Math.hypot(primitive.dxM, primitive.dyM) : Math.abs(primitive.dYawRad) * circumradius(footprint);
  return Math.max(1, Math.ceil(travel / boundM));
}

function interpolate(from: Pose, primitive: MotionPrimitive, t: number): Pose {
  return primitive.kind === 'translate'
    ? { ...from, xM: from.xM + primitive.dxM * t, yM: from.yM + primitive.dyM * t }
    : { ...from, yawRad: from.yawRad + primitive.dYawRad * t };
}

/** Independent re-validation of an emitted path. It does not reuse the search's
 * hull-of-endpoints sweep; instead it samples every transition densely enough
 * that consecutive footprints differ by at most `sweepBoundM`, inflates each
 * sample by that bound (so the union covers the continuous motion), and tests
 * each sample against every obstacle with the height interval. Also verifies that
 * each reported pose equals the previous pose plus its primitive and that ticks
 * are non-decreasing integers. Reports the first conflict. */
export function checkTrace(profile: RobotProfile, start: RobotState, steps: readonly PathStep[], obstacles: readonly StaticObstacle[], tolerances: Tolerances): TraceVerdict {
  const footprint = footprintFor(profile, start.loaded);
  const z = robotZInterval(profile, start.pose);
  let pose = start.pose, tick = 0, samples = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (!Number.isInteger(step.tick) || step.tick < tick) return { ok: false, code: 'TICK_ORDER', stepIndex: i };
    const expected = interpolate(pose, step.primitive, 1);
    if (!samePose(expected, step.pose)) return { ok: false, code: 'POSE_MISMATCH', stepIndex: i };
    const n = sampleCount(footprint, step.primitive, tolerances.sweepBoundM);
    if (n > MAX_SAMPLES) return { ok: false, code: 'UNRESOLVED', stepIndex: i };
    for (let k = 0; k <= n; k++) {
      const sample = inflate(transformPolygon(footprint, interpolate(pose, step.primitive, k / n)), tolerances.sweepBoundM);
      const hit = collides([sample], z, obstacles);
      samples++;
      if (hit.hit) return { ok: false, code: 'CONFLICT', stepIndex: i, obstacleId: hit.obstacleId };
    }
    pose = step.pose;
    tick = step.tick;
  }
  return { ok: true, steps: steps.length, samples };
}
