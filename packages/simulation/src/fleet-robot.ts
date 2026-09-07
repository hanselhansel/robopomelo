import type { Pose, RobotProfile } from '@robopomelo/spec';
import { compareRobotIds } from './clock.js';
import type { FleetStation, FleetTuning, LegRecord, SimEvent, SimEventKind } from './fleet-types.js';
import type { JobLedger, JobSpec } from './jobs.js';
import { cacheRoute, planRoute, reserve, standingObstacle, type CachedRoute, type LegGoal, type PlannerContext, type StationHold } from './planner.js';
import { cellsBounds, standingCells, type Conflict, type Reservation } from './reservations.js';
import type { PathStep, RobotState, StaticObstacle, Tick } from './types.js';

/** A leg the robot still has to plan: the job leg it is bound to. */
export type Pending = {
  goal: LegGoal; taskId: string | null; earliestStart: Tick; route: CachedRoute | null;
  replansLeft: number; blockedBy: Conflict | null; blockedSince: Tick | null; stuck: boolean; retryAt: Tick;
};
export type ActivePlan = { steps: PathStep[]; cursor: number; start: Tick; arrival: Tick; goal: LegGoal; taskId: string | null; retreat: boolean };
export type RobotRun = {
  id: string; profile: RobotProfile; state: RobotState; lowBattery: boolean;
  /** Validated start pose; doubles as the robot's own holding pose when no holding station is free. */
  home: Pose;
  job: JobSpec | null; legIndex: number;
  pending: Pending | null; plan: ActivePlan | null;
  service: { end: Tick; goal: LegGoal } | null;
  hold: StationHold | null; yieldRequested: boolean; parkRetryAt: Tick; parkFailures: number; legs: LegRecord[];
};

/** Per-tick event buffer: flushed sorted by robot id (stable), sequences strictly increasing. */
export class EventLog {
  readonly events: SimEvent[] = [];
  private buffer: SimEvent[] = [];
  private sequence = 0;
  emit(tick: Tick, robotId: string, kind: SimEventKind, taskId: string | null, resourceId: string | null, reason: string): void {
    this.buffer.push({ tick, sequence: -1, robotId, kind, taskId, resourceId, reason });
  }
  flush(): void {
    this.buffer.sort((a, b) => compareRobotIds(a.robotId, b.robotId));
    for (const e of this.buffer) this.events.push({ ...e, sequence: this.sequence++ });
    this.buffer = [];
  }
}

export type EngineShared = {
  ctx: PlannerContext; tuning: FleetTuning; ledger: JobLedger; log: EventLog;
  robots: Map<string, RobotRun>; stations: Map<string, FleetStation>;
};

export const legGoal = (station: FleetStation, loadedBefore: boolean): LegGoal => {
  const transition = station.kind === 'pickup' ? 'load' : station.kind === 'dropoff' ? 'unload' : 'none';
  return { pose: station.pose, transition, stationId: station.id, loadedAfter: transition === 'load' ? true : transition === 'unload' ? false : loadedBefore };
};

export function newPending(goal: LegGoal, taskId: string | null, earliestStart: Tick, replans: number): Pending {
  return { goal, taskId, earliestStart, route: null, replansLeft: replans, blockedBy: null, blockedSince: null, stuck: false, retryAt: 0 };
}

/** Cells other robots hold until further notice (standing now, or the goal of a plan in
 * execution) as obstacles for a replanning attempt: the bounds of those cells, so
 * avoiding the obstacle geometrically also avoids the open-ended reservations. Robots
 * holding any of `except` (the planner's own goal cells) are skipped: a goal occupant
 * cannot be routed around, only waited out. */
export function dynamicObstacles(self: RobotRun, shared: EngineShared, except: ReadonlySet<string> = new Set()): StaticObstacle[] {
  const out: StaticObstacle[] = [];
  for (const other of shared.robots.values()) {
    if (other === self) continue;
    const held = shared.ctx.table.ofRobot(other.id).filter((r) => r.resourceId.startsWith('c:') && r.end === Infinity).map((r) => r.resourceId);
    if (held.length > 0 && !held.some((c) => except.has(c))) out.push({ ...standingObstacle(other.id, other.profile, other.state, shared.ctx.tol), polygon: cellsBounds(held, shared.ctx.tol.gridM) });
  }
  return out;
}

/** Commits a reserved plan: rewrites the robot's reservations and records the leg. */
export function commit(robot: RobotRun, route: CachedRoute, start: Tick, arrival: Tick, goal: LegGoal, taskId: string | null, retreat: boolean, reservations: readonly Reservation[], departState: RobotState, now: Tick, shared: EngineShared): void {
  shared.ctx.table.clear(robot.id);
  shared.ctx.table.add(reservations);
  const steps = route.steps.map((s) => ({ ...s, tick: s.tick + start }));
  robot.plan = { steps, cursor: 0, start, arrival, goal, taskId, retreat };
  robot.hold = null; // the departure end of the slot is part of `reservations`
  robot.legs.push({ start: { ...departState, pose: { ...departState.pose } }, steps, departTick: start, arriveTick: arrival, taskId });
  shared.log.emit(now, robot.id, 'moving', taskId, goal.stationId, `${retreat ? 'retreat ' : ''}depart:${start} arrive:${arrival}`);
}

/** Load state at departure: a leg planned during service starts after the transition. */
export const departState = (robot: RobotRun): RobotState => (robot.service ? { ...robot.state, loaded: robot.service.goal.loadedAfter } : robot.state);

/** Tries to plan and reserve `goal` for the robot from its departure state (pose now,
 * load state after any service in progress). */
export type AttemptOutcome = { kind: 'committed' } | { kind: 'blocked'; conflict: Conflict } | { kind: 'infeasible'; reason: string } | { kind: 'unresolved' };
export function attempt(robot: RobotRun, goal: LegGoal, taskId: string | null, earliestStart: Tick, extra: readonly StaticObstacle[], cached: CachedRoute | null, retreat: boolean, now: Tick, shared: EngineShared): AttemptOutcome & { route?: CachedRoute } {
  let route = cached;
  const state = departState(robot);
  if (!route) {
    const result = planRoute(robot.profile, state, goal, extra, shared.ctx);
    if (result.kind === 'infeasible') return { kind: 'infeasible', reason: `ROUTE_${result.reason}` };
    if (result.kind === 'unresolved') return { kind: 'unresolved' };
    route = cacheRoute(robot.id, robot.profile, result.steps, state, goal, shared.ctx);
    if (!route) return { kind: 'infeasible', reason: 'NO_EXIT' };
  }
  const outcome = reserve({ robotId: robot.id, profile: robot.profile, state, route, goal, now, earliestStart, hold: robot.hold }, shared.ctx);
  if (outcome.kind === 'blocked') return { kind: 'blocked', conflict: outcome.conflict, route };
  if (outcome.delayedBy) shared.log.emit(now, robot.id, 'waiting', taskId, outcome.delayedBy.resourceId, `delayed-until:${outcome.start} by:${outcome.delayedBy.blockerId}`);
  commit(robot, route, outcome.start, outcome.arrival, goal, taskId, retreat, outcome.reservations, state, now, shared);
  return { kind: 'committed', route };
}

/** Standing reservation from `now` until further notice (idle, blocked or initial). */
export function standStill(robot: RobotRun, now: Tick, shared: EngineShared): void {
  shared.ctx.table.clear(robot.id);
  const cells = standingCells(robot.profile, robot.state, shared.ctx.tol);
  shared.ctx.table.add(cells.map((cell) => ({ resourceId: cell, robotId: robot.id, start: now, end: Infinity })));
  if (robot.hold) shared.ctx.table.add([{ resourceId: `s:${robot.hold.stationId}`, robotId: robot.id, start: robot.hold.from, end: Infinity }]);
}

/** Free holding stations by lattice distance, excluding the one the robot occupies. */
export function freeHoldings(robot: RobotRun, now: Tick, shared: EngineShared): FleetStation[] {
  const out: FleetStation[] = [];
  for (const station of shared.stations.values()) {
    if (station.kind !== 'holding' || robot.hold?.stationId === station.id) continue;
    if (shared.ctx.table.holdersAt(`s:${station.id}`, now).filter((id) => id !== robot.id).length < station.capacity) out.push(station);
  }
  const d = (s: FleetStation): number => Math.hypot(s.pose.xM - robot.state.pose.xM, s.pose.yM - robot.state.pose.yM);
  return out.sort((a, b) => d(a) - d(b) || (a.id < b.id ? -1 : 1));
}

/** Bounded backtracking to a verified holding pose: the two nearest free holding stations,
 * else the robot's own validated start pose. Each candidate is tried on its static route
 * first (cached, time-shifted against the table) and then around standing robots. Every
 * committed retreat passed S4 (findRoute) and the reservation table. */
export function retreat(robot: RobotRun, taskId: string | null, extra: readonly StaticObstacle[], now: Tick, shared: EngineShared): boolean {
  const loaded = departState(robot).loaded;
  const goals: LegGoal[] = freeHoldings(robot, now, shared).slice(0, 2).map((station) => ({ pose: station.pose, transition: 'none', stationId: station.id, loadedAfter: loaded }));
  const h = robot.home, p = robot.state.pose;
  if (h.xM !== p.xM || h.yM !== p.yM) goals.push({ pose: h, transition: 'none', stationId: null, loadedAfter: loaded });
  for (const goal of goals) {
    if (attempt(robot, goal, taskId, now, [], null, true, now, shared).kind === 'committed') return true;
    if (extra.length > 0 && attempt(robot, goal, taskId, now, extra, null, true, now, shared).kind === 'committed') return true;
  }
  return false;
}
