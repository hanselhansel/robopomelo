import type { Pose, RobotProfile } from '@robopomelo/spec';
import { ticksFor } from './clock.js';
import type { FleetTuning } from './fleet-types.js';
import { activeFootprint, applyPrimitive } from './motion.js';
import { cellsBounds, pathReservations, pathResources, standingCells, stationResourceId, type Conflict, type PathResources, type Reservation, type ReservationTable } from './reservations.js';
import { findRoute, type Bounds, type RouteResult, type RouteTransition } from './route.js';
import { RasterOracle } from './raster.js';
import { circumradius } from './sweep.js';
import { robotZInterval, type MotionPrimitive, type PathStep, type RobotState, type StaticObstacle, type Tick, type Tolerances } from './types.js';

/** Where a leg ends: the service pose, the station transition and the load state after it. */
export type LegGoal = { pose: Pose; transition: RouteTransition; stationId: string | null; loadedAfter: boolean };
export type PlannerContext = {
  obstacles: readonly StaticObstacle[]; bounds: Bounds; tol: Tolerances; tuning: FleetTuning; expansionLimit: number; table: ReservationTable;
  /** Static route results keyed by profile, load state, start and goal; static obstacles never change within a run. */
  routeCache: Map<string, RouteResult>;
  /** Rasterized static-scene clearance per robot profile; conservative, see raster.ts. */
  oracles: Map<string, RasterOracle>;
};
export function oracleFor(profile: RobotProfile, ctx: PlannerContext): RasterOracle {
  let oracle = ctx.oracles.get(profile.id);
  if (!oracle) { oracle = new RasterOracle(profile, ctx.obstacles, ctx.bounds, ctx.tol); ctx.oracles.set(profile.id, oracle); }
  return oracle;
}
/** A statically verified route with its swept resources, cached until the robot moves. */
export type CachedRoute = { steps: PathStep[]; res: PathResources; exits: string[][]; template: Reservation[]; firstTouch: Tick };
export type StationHold = { stationId: string; from: Tick };

const aabb = (polygon: readonly [number, number][]): Bounds => ({
  minXM: Math.min(...polygon.map((p) => p[0])), maxXM: Math.max(...polygon.map((p) => p[0])),
  minYM: Math.min(...polygon.map((p) => p[1])), maxYM: Math.max(...polygon.map((p) => p[1])),
});
const meets = (a: Bounds, b: Bounds): boolean => a.minXM <= b.maxXM && b.minXM <= a.maxXM && a.minYM <= b.maxYM && b.minYM <= a.maxYM;

/** Route search bounded to a corridor around start and goal first (with only the
 * obstacles that can reach it), falling back to the full floor when the corridor is
 * exhausted. Sound: obstacles outside the search bounds by more than the robot reach
 * can never be touched by a pose inside them. */
export function planRoute(profile: RobotProfile, start: RobotState, goal: LegGoal, extra: readonly StaticObstacle[], ctx: PlannerContext): RouteResult {
  const poseKey = (p: Pose): string => `${p.xM},${p.yM},${p.yawRad}`;
  const key = extra.length === 0 ? `${profile.id}|${start.loaded}|${poseKey(start.pose)}|${poseKey(goal.pose)}|${goal.transition}` : null;
  const hit = key === null ? undefined : ctx.routeCache.get(key);
  if (hit) return hit;
  const result = searchRoute(profile, start, goal, extra, ctx);
  if (key !== null) ctx.routeCache.set(key, result);
  return result;
}

function searchRoute(profile: RobotProfile, start: RobotState, goal: LegGoal, extra: readonly StaticObstacle[], ctx: PlannerContext): RouteResult {
  // Escape searches (around standing robots) are capped separately; they are bounded by the replan budget too.
  const limit = extra.length === 0 ? ctx.expansionLimit : Math.min(ctx.expansionLimit, ctx.tuning.escapeExpansions);
  const reach = Math.max(circumradius(activeFootprint(profile, false)), circumradius(activeFootprint(profile, true))) + ctx.tol.sweepBoundM + ctx.tol.gridM;
  const search = (bounds: Bounds): RouteResult => {
    const wide = { minXM: bounds.minXM - reach, maxXM: bounds.maxXM + reach, minYM: bounds.minYM - reach, maxYM: bounds.maxYM + reach };
    // The static scene is answered by the memoized oracle; only dynamic extras travel as obstacles.
    const dynamic = extra.filter((o) => meets(aabb(o.polygon), wide));
    return findRoute(profile, start, { pose: goal.pose, transition: goal.transition }, dynamic, { bounds, tolerances: ctx.tol, expansionLimit: limit, heuristicWeight: ctx.tuning.heuristicWeight, staticOracle: oracleFor(profile, ctx) });
  };
  const m = ctx.tuning.routeMarginM, b = ctx.bounds;
  const corridor: Bounds = {
    minXM: Math.max(b.minXM, Math.min(start.pose.xM, goal.pose.xM) - m), maxXM: Math.min(b.maxXM, Math.max(start.pose.xM, goal.pose.xM) + m),
    minYM: Math.max(b.minYM, Math.min(start.pose.yM, goal.pose.yM) - m), maxYM: Math.min(b.maxYM, Math.max(start.pose.yM, goal.pose.yM) + m),
  };
  const first = search(corridor);
  return first.kind === 'infeasible' && first.reason === 'EXHAUSTED' ? search(b) : first;
}

/** Statically clear single primitives out of the goal pose in the post-transition
 * load state, as swept cell sets. Necessary (not sufficient) evidence that the robot
 * can leave the constrained station resource; the real exit route passes S4 later. */
export function exitCells(profile: RobotProfile, goal: LegGoal, ctx: PlannerContext): string[][] {
  const state: RobotState = { profileId: profile.id, pose: goal.pose, loaded: goal.loadedAfter };
  const yawUnit = (2 * Math.PI) / ctx.tol.yawSteps, g = ctx.tol.gridM;
  const primitives: MotionPrimitive[] = [{ kind: 'rotate', dYawRad: yawUnit }, { kind: 'rotate', dYawRad: -yawUnit }];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) primitives.push({ kind: 'translate', dxM: dx! * g, dyM: dy! * g });
  const out: string[][] = [];
  for (const primitive of primitives) {
    if (oracleFor(profile, ctx).check(state, primitive).kind !== 'clear') continue;
    const res = pathResources(profile, state, [{ pose: applyPrimitive(goal.pose, primitive), tick: 1, primitive }], ctx.tol);
    out.push([...new Set([...res.steps[0]!.cells, ...res.finalCells])]);
  }
  return out;
}

/** Statically verified route plus exit evidence, or null when the goal has no exit. */
export function cacheRoute(robotId: string, profile: RobotProfile, steps: PathStep[], start: RobotState, goal: LegGoal, ctx: PlannerContext): CachedRoute | null {
  const exits = goal.stationId ? exitCells(profile, goal, ctx) : [];
  if (goal.stationId && exits.length === 0) return null;
  const res = pathResources(profile, start, steps, ctx.tol);
  // Relative (start = 0) reservations, shifted per attempt; the station slot opens when the
  // first step touching the goal footprint begins.
  const goalSet = new Set(res.finalCells);
  const touching = res.steps.find((s) => s.cells.some((c) => goalSet.has(c)));
  return { steps, res, exits, template: pathReservations(robotId, res, 0, Infinity), firstTouch: touching ? touching.from : res.arrival };
}

export type ReserveOutcome =
  | { kind: 'committed'; start: Tick; arrival: Tick; reservations: Reservation[]; delayedBy: Conflict | null }
  | { kind: 'blocked'; conflict: Conflict };

type ReserveInput = { robotId: string; profile: RobotProfile; state: RobotState; route: CachedRoute; goal: LegGoal; now: Tick; earliestStart: Tick; hold: StationHold | null };

/** Whole-plan time shifting against the reservation table. The candidate set is the
 * swept path, the standing footprint until departure, station approach/exit slots
 * and, as probes only, at least one exit cell set for a window after service. A
 * conflict whose end is Infinity (a standing robot) cannot be waited out and blocks. */
export function reserve(input: ReserveInput, ctx: PlannerContext): ReserveOutcome {
  const { robotId, profile, state, route, goal, now, hold } = input;
  const { res } = route;
  const stepTicks = Math.max(1, ticksFor(ctx.tol.gridM, profile.maxSpeedMps));
  const exitWindow = ctx.tuning.serviceTicks + stepTicks;
  const standing = standingCells(profile, state, ctx.tol);
  let start = Math.max(now, input.earliestStart), delayedBy: Conflict | null = null;
  for (let attempt = 0; attempt <= ctx.tuning.maxShifts; attempt++) {
    const arrival = start + res.arrival;
    const reservations = route.template.map((r): Reservation => ({ ...r, start: r.start + start, end: r.end + start }));
    if (start > now) for (const cell of standing) reservations.push({ resourceId: cell, robotId, start: now, end: start });
    if (hold) reservations.push({ resourceId: stationResourceId(hold.stationId), robotId, start: hold.from, end: Math.max(hold.from + 1, start + stepTicks) });
    if (goal.stationId) reservations.push({ resourceId: stationResourceId(goal.stationId), robotId, start: start + route.firstTouch, end: Infinity });
    const conflicts = ctx.table.conflicts(reservations);
    let worst: Conflict | null = null;
    for (const c of conflicts) if (!worst || c.end - c.candidateStart > worst.end - worst.candidateStart) worst = c;
    if (goal.stationId) {
      // Exit probe: the best exit is the one whose worst conflict ends soonest.
      let bestExit: Conflict | null | undefined;
      for (const cells of route.exits) {
        const probe = cells.map((cell): Reservation => ({ resourceId: cell, robotId, start: arrival, end: arrival + exitWindow }));
        let exitWorst: Conflict | null = null;
        for (const c of ctx.table.conflicts(probe)) if (!exitWorst || c.end > exitWorst.end) exitWorst = c;
        if (exitWorst === null) { bestExit = null; break; }
        if (bestExit === undefined || exitWorst.end < bestExit!.end) bestExit = exitWorst;
      }
      if (bestExit && (!worst || bestExit.end - bestExit.candidateStart > worst.end - worst.candidateStart)) worst = bestExit;
    }
    if (!worst) return { kind: 'committed', start, arrival, reservations, delayedBy };
    if (worst.end === Infinity) return { kind: 'blocked', conflict: worst };
    delayedBy = worst;
    start += Math.max(1, worst.end - worst.candidateStart);
  }
  return { kind: 'blocked', conflict: delayedBy! };
}

/** A standing robot as an obstacle for replanning: the bounding rectangle of its
 * reserved cells, so a route that clears it also clears its cell reservations. */
export function standingObstacle(id: string, profile: RobotProfile, state: RobotState, tol: Tolerances): StaticObstacle {
  return { id: `robot:${id}`, polygon: cellsBounds(standingCells(profile, state, tol), tol.gridM), ...robotZInterval(profile, state.pose) };
}
