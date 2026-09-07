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
export {
  ENGINE_VERSION, DEFAULT_TUNING,
  type SimEvent, type SimEventKind, type Termination, type RunIdentity, type RunManifest, type PolicyName, type Policy,
  type FleetStation, type FleetRobot, type FleetTuning, type FleetInput, type FleetLimits, type LegRecord, type RobotReport,
  type Unresolved, type FleetMetrics, type FleetResult,
} from './fleet-types.js';
export { generateJobs, JobLedger, JOB_STATES, type JobSpec, type JobState, type LedgerCounts } from './jobs.js';
export { assign, eligible, effectivePriority, orderJobs, latticeDistanceM, type AssignableRobot, type AssignmentContext, type Assignment } from './assignment.js';
export {
  ReservationTable, cellId, edgeId, reverseEdge, stationResourceId, cellOfPoint, cellSquare, cellsOf, cellsBounds, standingCells, pathResources, pathReservations,
  type Reservation, type Conflict, type StepResources, type PathResources,
} from './reservations.js';
export { findWaitCycles, type WaitEdge, type WaitCycle } from './wait-graph.js';
export { sceneObstacles, floorBounds, snapPose, servicePoses } from './stations.js';
export { planRoute, exitCells, cacheRoute, reserve, standingObstacle, type LegGoal, type PlannerContext, type CachedRoute, type ReserveOutcome, type StationHold } from './planner.js';
export { runFleet } from './fleet.js';
export { assertTaskConservation, computeMetrics } from './metrics.js';
export { semanticInputHash, variantHash, workloadHash, assetHashes, type SemanticInput } from './input-hash.js';
export { evaluateObjectives, validateObjectiveDefinitions, measure, type ObjectiveEvaluation, type ObjectiveContext } from './objectives.js';
export { compareRuns, type RunSummary, type Comparison, type ComparedRun, type ObjectiveDelta, type Spread } from './compare.js';
