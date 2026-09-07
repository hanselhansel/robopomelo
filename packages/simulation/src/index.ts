export {
  POLICY_VERSION, TICK_MS, DEFAULT_TOLERANCES, SimulationError, obstacleFromInstance, robotZInterval,
  type Tick, type Vec2, type Polygon, type OrientedBox, type ZInterval, type StaticObstacle, type RobotState,
  type MotionPrimitive, type PathStep, type Tolerances, type SweepResult,
} from './types.js';
export { ticksFor, ticksForSeconds, secondsFor, compareRobotIds, orderRobotIds } from './clock.js';
export { xorshift32 } from './prng.js';
export {
  transformPolygon, convexHull, inflate, circumradius, polygonsOverlap, sweepTranslation, sweepRotation,
  rotationSubdivisions, standingPolygon, zIntersects, collides, type CollisionResult,
} from './sweep.js';
export { assertDrive, activeFootprint, primitiveFeasible, applyPrimitive, primitiveSeconds, checkMove, standingClear, type MoveCheck } from './motion.js';
export {
  findRoute, DEFAULT_EXPANSION_LIMIT,
  type Bounds, type RouteGoal, type RouteTransition, type RouteOptions, type RouteResult, type InfeasibleReason,
} from './route.js';
export { checkTrace, type TraceVerdict } from './trace-check.js';
