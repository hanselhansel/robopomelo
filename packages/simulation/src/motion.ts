import type { Pose, RobotProfile } from '@robopomelo/spec';
import { secondsFor } from './clock.js';
import { collides, convexHull, standingPolygon, sweepRotation, sweepTranslation } from './sweep.js';
import { SimulationError, robotZInterval, type MotionPrimitive, type Polygon, type RobotState, type StaticObstacle, type Tolerances } from './types.js';

const SUPPORTED_DRIVES: ReadonlySet<string> = new Set(['differential', 'omnidirectional']);
/** Cosine tolerance when testing that a translation is parallel to the heading. */
const HEADING_EPS = 1e-6;

export function assertDrive(profile: RobotProfile): void {
  if (!SUPPORTED_DRIVES.has(profile.drive)) throw new SimulationError('UNSUPPORTED_DRIVE', `robot profile ${profile.id} has unsupported drive "${String(profile.drive)}"`);
}

/** Footprint for the current load state. Footprints are relative to the drive
 * origin (the pose point): a footprint offset from the origin is not recentred,
 * so rotations pivot about the pose point and sweep the offset area. Non-convex
 * footprints are hulled, a conservative superset. */
export function activeFootprint(profile: RobotProfile, loaded: boolean): Polygon {
  const raw = loaded ? profile.loadedFootprintM : profile.footprintM;
  if (raw.length < 3) throw new SimulationError('INVALID_FOOTPRINT', `robot profile ${profile.id} footprint needs at least three vertices`);
  return convexHull(raw.map(([x, y]) => [x, y]));
}

/** Drive constraint only; clearance is a separate question answered by checkMove. */
export function primitiveFeasible(profile: RobotProfile, pose: Pose, primitive: MotionPrimitive): boolean {
  assertDrive(profile);
  if (primitive.kind === 'rotate') return primitive.dYawRad !== 0;
  const len = Math.hypot(primitive.dxM, primitive.dyM);
  if (len === 0) return false;
  if (profile.drive === 'omnidirectional') return true;
  const along = (primitive.dxM * Math.cos(pose.yawRad) + primitive.dyM * Math.sin(pose.yawRad)) / len;
  if (along >= 1 - HEADING_EPS) return true;
  return profile.reverse && along <= -1 + HEADING_EPS;
}

export function applyPrimitive(pose: Pose, primitive: MotionPrimitive): Pose {
  return primitive.kind === 'translate'
    ? { ...pose, xM: pose.xM + primitive.dxM, yM: pose.yM + primitive.dyM }
    : { ...pose, yawRad: pose.yawRad + primitive.dYawRad };
}

/** Duration at maximum linear or angular speed. Acceleration and deceleration are
 * ignored at this layer; the profile fields are retained for later refinement. */
export function primitiveSeconds(profile: RobotProfile, primitive: MotionPrimitive): number {
  if (primitive.kind === 'translate') {
    if (!(profile.maxSpeedMps > 0)) throw new SimulationError('INVALID_SPEED', `robot profile ${profile.id} needs a positive maxSpeedMps`);
    return secondsFor(Math.hypot(primitive.dxM, primitive.dyM), profile.maxSpeedMps);
  }
  if (!(profile.maxAngularRadps > 0)) throw new SimulationError('INVALID_SPEED', `robot profile ${profile.id} needs a positive maxAngularRadps`);
  return secondsFor(primitive.dYawRad, profile.maxAngularRadps);
}

export type MoveCheck =
  | { kind: 'clear' }
  | { kind: 'blocked'; obstacleId: string }
  | { kind: 'infeasible'; reason: 'DRIVE_CONSTRAINT' }
  | { kind: 'unresolved'; reason: 'SUBDIVISION_LIMIT' };

/** Full swept-volume clearance for one primitive in the robot's current load
 * state. A loaded robot rotates only if the loaded footprint's sweep is clear. */
export function checkMove(profile: RobotProfile, state: RobotState, primitive: MotionPrimitive, obstacles: readonly StaticObstacle[], tolerances: Tolerances): MoveCheck {
  if (!primitiveFeasible(profile, state.pose, primitive)) return { kind: 'infeasible', reason: 'DRIVE_CONSTRAINT' };
  const footprint = activeFootprint(profile, state.loaded);
  let swept: Polygon[];
  if (primitive.kind === 'translate') swept = sweepTranslation(footprint, state.pose, applyPrimitive(state.pose, primitive), tolerances);
  else {
    const sweep = sweepRotation(footprint, state.pose, primitive.dYawRad, tolerances);
    if (!sweep.resolved) return { kind: 'unresolved', reason: sweep.reason };
    swept = sweep.polygons;
  }
  const hit = collides(swept, robotZInterval(profile, state.pose), obstacles);
  return hit.hit ? { kind: 'blocked', obstacleId: hit.obstacleId } : { kind: 'clear' };
}

/** Static clearance of a footprint standing at a pose, inflated by the stated
 * tolerance (used for start and station checks). */
export function standingClear(profile: RobotProfile, pose: Pose, loaded: boolean, obstacles: readonly StaticObstacle[], tolerances: Tolerances): MoveCheck {
  const hit = collides([standingPolygon(activeFootprint(profile, loaded), pose, tolerances)], robotZInterval(profile, pose), obstacles);
  return hit.hit ? { kind: 'blocked', obstacleId: hit.obstacleId } : { kind: 'clear' };
}
