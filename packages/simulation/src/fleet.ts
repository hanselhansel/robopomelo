import { sha256Hex } from '@robopomelo/spatial';
import { assign, type AssignableRobot, type AssignmentContext } from './assignment.js';
import { orderRobotIds } from './clock.js';
import { EventLog, attempt, dynamicObstacles, legGoal, newPending, retreat, standStill, type EngineShared, type RobotRun } from './fleet-robot.js';
import { prepare, type Prepared } from './fleet-setup.js';
import { DEFAULT_TUNING, ENGINE_VERSION, type FleetInput, type FleetLimits, type FleetResult, type LegRecord, type Termination, type Unresolved } from './fleet-types.js';
import { JobLedger } from './jobs.js';
import { computeMetrics } from './metrics.js';
import { ReservationTable, stationResourceId } from './reservations.js';
import { SimulationError, type Tick } from './types.js';
import { findWaitCycles, type WaitEdge } from './wait-graph.js';

type Outcome = { termination: Termination; reason: string; unresolved: Unresolved | null };

/** Deterministic fleet tick loop. Each tick: release jobs, assign, plan and reserve
 * routes against static obstacles plus the reservation table, advance robots, apply
 * aging, bounded replanning with backtracking only to verified holding poses, and
 * deadlock detection on the wait-for graph. The host owns wall-clock time through
 * `limits.shouldStop`; the engine never reads a clock or an unseeded random source. */
export function runFleet(input: FleetInput, limits: FleetLimits): FleetResult {
  const tuning = { ...DEFAULT_TUNING, ...input.tuning };
  let prepared: Prepared;
  try { prepared = prepare(input, limits, tuning); } catch (error) {
    if (!(error instanceof SimulationError)) throw error;
    return finish(input, { termination: 'invalid', reason: `${error.code}: ${error.message}`, unresolved: null }, 0, new EventLog(), new JobLedger(), []);
  }
  const { jobs, stations, tol, obstacles, bounds } = prepared;
  const table = new ReservationTable(new Map([...stations.values()].map((s) => [stationResourceId(s.id), s.capacity])));
  const ledger = new JobLedger(), log = new EventLog();
  const shared: EngineShared = { ctx: { obstacles, bounds, tol, tuning, expansionLimit: limits.maxExpansionsPerRoute, table, routeCache: new Map() }, tuning, ledger, log, robots: prepared.robots, stations };
  const order = orderRobotIds([...prepared.robots.keys()]).map((id) => prepared.robots.get(id)!);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const rejected = new Set<string>();
  for (const robot of order) standStill(robot, 0, shared);

  const isIdle = (r: RobotRun): boolean => r.job === null && r.plan === null && r.pending === null && r.service === null;
  const stationLoad = (stationId: string): number => order.filter((r) => r.job && (r.job.fromStationId === stationId || r.job.toStationId === stationId)).length;

  const failJob = (robot: RobotRun, code: string, tick: Tick): void => {
    ledger.transition(robot.job!.id, 'failed');
    log.emit(tick, robot.id, 'completed', robot.job!.id, robot.pending?.goal.stationId ?? null, `failed:${code}`);
    robot.job = null; robot.pending = null;
  };
  /** Leg 0 static infeasibility rejects the pair and returns the job to queued; once every robot rejected it, it fails. */
  const rejectOrFail = (robot: RobotRun, code: string, tick: Tick): void => {
    const job = robot.job!;
    if (robot.legIndex > 0) { failJob(robot, code, tick); return; }
    rejected.add(`${job.id}|${robot.id}`);
    if (order.every((r) => rejected.has(`${job.id}|${r.id}`))) { failJob(robot, code, tick); return; }
    ledger.transition(job.id, 'queued');
    log.emit(tick, robot.id, 'waiting', job.id, null, `rejected:${code}`);
    robot.job = null; robot.pending = null;
  };

  const planPending = (robot: RobotRun, tick: Tick): void => {
    const p = robot.pending!;
    const first = attempt(robot, p.goal, p.taskId, p.earliestStart, [], p.route, false, tick, shared);
    if (first.route) p.route = first.route;
    if (first.kind === 'infeasible') { rejectOrFail(robot, first.reason, tick); return; }
    if (first.kind === 'unresolved') { rejectOrFail(robot, 'ROUTE_UNRESOLVED', tick); return; }
    if (first.kind === 'committed') { robot.pending = null; return; }
    // A new blocking situation (different blocker or resource) restores the bounded budget.
    if (p.blockedBy && (p.blockedBy.blockerId !== first.conflict.blockerId || p.blockedBy.resourceId !== first.conflict.resourceId)) { p.replansLeft = limits.replanBudgetPerRobot; p.blockedSince = null; p.stuck = false; }
    p.blockedBy = first.conflict;
    p.blockedSince ??= tick;
    log.emit(tick, robot.id, 'waiting', p.taskId, first.conflict.resourceId, `blocked-by:${first.conflict.blockerId}`);
    const blocker = prepared.robots.get(first.conflict.blockerId);
    if (blocker && isIdle(blocker)) blocker.yieldRequested = true;
    p.retryAt = tick + tuning.retryTicks;
    if (tick - p.blockedSince < tuning.patienceTicks || p.replansLeft === 0) { if (p.replansLeft === 0) p.stuck = true; return; }
    // A moving blocker holds its destination open-ended only until it arrives and plans on; wait it out.
    if (blocker?.plan) return;
    // Bounded escape: route around standing robots (goal occupants excepted, they can only be waited
    // out), else back off to a verified holding pose unless already holding one.
    p.replansLeft--;
    const goalCells = new Set(p.route!.res.finalCells);
    const extra = dynamicObstacles(robot, shared, goalCells);
    const onGoal = goalCells.has(first.conflict.resourceId);
    if (!onGoal) {
      const second = attempt(robot, p.goal, p.taskId, p.earliestStart, extra, null, false, tick, shared);
      if (second.kind === 'committed') { robot.pending = null; return; }
      if (second.route) p.route = second.route;
    }
    const atHolding = robot.hold !== null && stations.get(robot.hold.stationId)?.kind === 'holding';
    if (!atHolding && retreat(robot, p.taskId, extra, tick, shared)) { p.route = null; p.blockedSince = null; p.retryAt = robot.plan!.arrival; return; }
    if (p.replansLeft === 0) p.stuck = true;
  };

  const arrive = (robot: RobotRun, tick: Tick): void => {
    const plan = robot.plan!;
    robot.state = { ...robot.state, pose: plan.goal.pose };
    robot.plan = null;
    if (plan.goal.stationId) robot.hold = { stationId: plan.goal.stationId, from: tick };
    standStill(robot, tick, shared);
    if (plan.retreat) { if (robot.pending) { robot.pending.route = null; robot.pending.retryAt = tick; } return; }
    robot.service = { end: tick + tuning.serviceTicks, goal: plan.goal };
    log.emit(tick, robot.id, 'loading', plan.taskId, plan.goal.stationId, `until:${robot.service.end}`);
    if (robot.job && robot.legIndex === 0) {
      robot.legIndex = 1;
      robot.pending = newPending(legGoal(stations.get(robot.job.toStationId)!, plan.goal.loadedAfter), robot.job.id, robot.service.end, limits.replanBudgetPerRobot);
    }
  };

  const advance = (robot: RobotRun, tick: Tick): void => {
    if (robot.service && robot.service.end <= tick) {
      robot.state = { ...robot.state, loaded: robot.service.goal.loadedAfter };
      robot.service = null;
      if (!robot.plan) standStill(robot, tick, shared); // footprint may have changed with the load state
      if (robot.job && robot.legIndex === 1 && robot.pending === null && robot.plan === null) {
        ledger.transition(robot.job.id, 'completed');
        log.emit(tick, robot.id, 'completed', robot.job.id, robot.hold?.stationId ?? null, 'completed');
        robot.job = null;
      }
    }
    const plan = robot.plan;
    if (!plan || tick < plan.start) return;
    while (plan.cursor < plan.steps.length && plan.steps[plan.cursor]!.tick <= tick) { robot.state = { ...robot.state, pose: plan.steps[plan.cursor]!.pose }; plan.cursor++; }
    if (tick >= plan.arrival) {
      if (robot.service) { robot.state = { ...robot.state, loaded: robot.service.goal.loadedAfter }; robot.service = null; }
      arrive(robot, tick);
    }
  };

  const assignJobs = (tick: Tick): void => {
    const queued = ledger.idsIn('queued').map((id) => jobById.get(id)!);
    const idle = order.filter(isIdle).map((r): AssignableRobot => ({ id: r.id, profileId: r.profile.id, pose: r.state.pose, lowBattery: r.lowBattery }));
    if (queued.length === 0 || idle.length === 0) return;
    const ctx: AssignmentContext = { tick, agingTicks: tuning.agingTicks, serviceTicks: tuning.serviceTicks, gridM: tol.gridM, profiles: prepared.profiles, stations, stationLoad, rejected };
    for (const { jobId, robotId } of assign(input.policy.name, queued, idle, ctx)) {
      const robot = prepared.robots.get(robotId)!, job = jobById.get(jobId)!;
      ledger.transition(jobId, 'active');
      robot.job = job; robot.legIndex = 0; robot.yieldRequested = false;
      robot.pending = newPending(legGoal(stations.get(job.fromStationId)!, robot.state.loaded), job.id, tick, limits.replanBudgetPerRobot);
      log.emit(tick, robot.id, 'assigned', job.id, job.fromStationId, `released:${job.releaseTick} priority:${job.priority}`);
    }
  };

  const detectDeadlock = (tick: Tick): Unresolved | null => {
    const edges: WaitEdge[] = [];
    for (const r of order) if (r.pending?.blockedBy && !r.plan) edges.push({ robotId: r.id, blockerId: r.pending.blockedBy.blockerId, resourceId: r.pending.blockedBy.resourceId });
    const cycles = findWaitCycles(edges).filter((c) => c.robotIds.every((id) => prepared.robots.get(id)!.pending!.stuck));
    if (cycles.length === 0) return null;
    const unresolved: Unresolved = { robotIds: orderRobotIds([...new Set(cycles.flatMap((c) => c.robotIds))]), resourceIds: [...new Set(cycles.flatMap((c) => c.resourceIds))].sort() };
    for (const id of unresolved.robotIds) { const r = prepared.robots.get(id)!; log.emit(tick, id, 'deadlock', r.pending!.taskId, r.pending!.blockedBy!.resourceId, `wait-for:${r.pending!.blockedBy!.blockerId}`); }
    return unresolved;
  };

  let released = 0, tick = 0, outcome: Outcome | null = null;
  for (;;) {
    if (limits.shouldStop?.()) { ledger.cancelOpen(); outcome = { termination: 'cancelled', reason: 'host requested stop', unresolved: null }; break; }
    while (released < jobs.length && jobs[released]!.releaseTick <= tick) ledger.release(jobs[released++]!.id);
    for (const robot of order) advance(robot, tick);
    assignJobs(tick);
    for (const robot of order) if (robot.pending && !robot.plan && robot.pending.retryAt <= tick) planPending(robot, tick);
    for (const robot of order) {
      // Idle robots vacate pickup/dropoff/charger poses (park at a free holding pose) and answer yield requests.
      if (!isIdle(robot)) continue;
      const atHolding = robot.hold !== null && stations.get(robot.hold.stationId)?.kind === 'holding';
      const shouldPark = robot.hold !== null && !atHolding;
      if (atHolding || (!robot.yieldRequested && (!shouldPark || robot.parkRetryAt > tick))) { robot.yieldRequested = false; continue; }
      robot.yieldRequested = false;
      // Exponential backoff on failed parking attempts bounds the search cost of a robot that cannot leave yet.
      if (retreat(robot, null, dynamicObstacles(robot, shared), tick, shared)) robot.parkFailures = 0;
      else robot.parkFailures = Math.min(robot.parkFailures + 1, 6);
      robot.parkRetryAt = tick + tuning.retryTicks * 2 ** robot.parkFailures;
    }
    const unresolved = detectDeadlock(tick);
    log.flush();
    if (unresolved) { outcome = { termination: 'deadlock', reason: `wait-for cycle among ${unresolved.robotIds.join(', ')}`, unresolved }; break; }
    const counts = ledger.counts();
    if (released === jobs.length && counts.queued + counts.active === 0 && order.every(isIdle)) { outcome = { termination: 'completed', reason: 'all jobs terminal and fleet idle', unresolved: null }; break; }
    if (tick >= limits.maxTicks) { outcome = { termination: 'budget', reason: `maxTicks ${limits.maxTicks} reached`, unresolved: null }; break; }
    if (tick % 500 === 499) table.prune(tick);
    tick++;
  }
  return finish(input, outcome, tick, log, ledger, order);
}

function finish(input: FleetInput, outcome: Outcome, durationTicks: Tick, log: EventLog, ledger: JobLedger, order: readonly RobotRun[]): FleetResult {
  const events = log.events;
  const robots = order.map((r) => ({ id: r.id, profileId: r.profile.id, finalPose: r.state.pose, loaded: r.state.loaded, legs: r.legs as LegRecord[] }));
  const manifest = {
    ...input.identity, formatVersion: '1.0.0' as const, engineVersion: ENGINE_VERSION, policyVersion: `${input.policy.name}/${input.policy.version}`,
    seed: input.seed, durationTicks, termination: outcome.termination, eventCount: events.length, eventSha256: sha256Hex(JSON.stringify(events)),
  };
  return { manifest, events, ledger: ledger.counts(), metrics: computeMetrics(events, durationTicks, outcome.termination, robots.map((r) => r.id)), unresolved: outcome.unresolved, robots, termination: outcome.termination, reason: outcome.reason };
}
