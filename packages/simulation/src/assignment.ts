import type { Pose, RobotProfile } from '@robopomelo/spec';
import { ticksFor } from './clock.js';
import type { FleetStation, PolicyName } from './fleet-types.js';
import type { JobSpec } from './jobs.js';
import { SimulationError, type Tick } from './types.js';

export type AssignableRobot = { id: string; profileId: string; pose: Pose; lowBattery: boolean };
export type AssignmentContext = {
  tick: Tick;
  agingTicks: number;
  serviceTicks: number;
  gridM: number;
  profiles: ReadonlyMap<string, RobotProfile>;
  stations: ReadonlyMap<string, FleetStation>;
  /** Robots currently bound (active job) to a station, for queue/wait estimates. */
  stationLoad: (stationId: string) => number;
  /** `${jobId}|${robotId}` pairs a robot already rejected (static route infeasible). */
  rejected?: ReadonlySet<string>;
};
export type Assignment = { jobId: string; robotId: string };

/** Base priority plus one level per `agingTicks` of waiting since release. Stable
 * priority plus aging means a low-priority job cannot starve indefinitely. */
export function effectivePriority(job: JobSpec, tick: Tick, agingTicks: number): number {
  if (!(agingTicks > 0)) throw new SimulationError('INVALID_TUNING', `agingTicks ${agingTicks} must be positive`);
  return job.priority + Math.floor(Math.max(0, tick - job.releaseTick) / agingTicks);
}

/** Deterministic queue order: higher effective priority, earlier release, then id. */
export function orderJobs(jobs: readonly JobSpec[], ctx: AssignmentContext): JobSpec[] {
  return [...jobs].sort((a, b) => effectivePriority(b, ctx.tick, ctx.agingTicks) - effectivePriority(a, ctx.tick, ctx.agingTicks) || a.releaseTick - b.releaseTick || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Load capability (a loaded footprint exists) and charging availability (a
 * low-battery robot may only take a job whose destination is a charger). */
export function eligible(job: JobSpec, robot: AssignableRobot, ctx: AssignmentContext): boolean {
  const profile = ctx.profiles.get(robot.profileId);
  const from = ctx.stations.get(job.fromStationId), to = ctx.stations.get(job.toStationId);
  if (!profile || !from || !to) return false;
  if (from.kind === 'pickup' && profile.loadedFootprintM.length < 3) return false;
  if (robot.lowBattery && to.kind !== 'charger') return false;
  return !ctx.rejected?.has(`${job.id}|${robot.id}`);
}

/** Octile lattice distance in meters between two poses on the gridM lattice. */
export function latticeDistanceM(a: Pose, b: Pose, gridM: number): number {
  const dx = Math.abs(Math.round((a.xM - b.xM) / gridM)), dy = Math.abs(Math.round((a.yM - b.yM) / gridM));
  return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * gridM;
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Estimated travel plus reservation wait plus queue cost, in ticks. */
function estimateCost(job: JobSpec, robot: AssignableRobot, ctx: AssignmentContext): number {
  const profile = ctx.profiles.get(robot.profileId)!, from = ctx.stations.get(job.fromStationId)!, to = ctx.stations.get(job.toStationId)!;
  const travel = ticksFor(latticeDistanceM(robot.pose, from.pose, ctx.gridM) + latticeDistanceM(from.pose, to.pose, ctx.gridM), profile.maxSpeedMps);
  const reservationWait = ctx.stationLoad(job.fromStationId) * ctx.serviceTicks;
  const queue = ctx.stationLoad(job.toStationId) * ctx.serviceTicks;
  return travel + reservationWait + queue;
}

/** One interface, two policies.
 * - `fifo-nearest`: jobs in queue order, each takes the nearest eligible robot by lattice distance (tie: robot id).
 * - `cost-estimate`: greedy global minimum of estimated cost over all eligible pairs (ties: robot id, then job id). */
export function assign(policy: PolicyName, queued: readonly JobSpec[], idle: readonly AssignableRobot[], ctx: AssignmentContext): Assignment[] {
  const jobs = orderJobs(queued, ctx);
  const robots = [...idle].sort((a, b) => byId(a.id, b.id));
  const out: Assignment[] = [];
  if (policy === 'fifo-nearest') {
    for (const job of jobs) {
      const from = ctx.stations.get(job.fromStationId);
      if (!from) continue;
      let best: { robot: AssignableRobot; d: number } | null = null;
      for (const robot of robots) {
        if (!eligible(job, robot, ctx)) continue;
        const d = latticeDistanceM(robot.pose, from.pose, ctx.gridM);
        if (!best || d < best.d) best = { robot, d };
      }
      if (best) { out.push({ jobId: job.id, robotId: best.robot.id }); robots.splice(robots.indexOf(best.robot), 1); }
    }
    return out;
  }
  if (policy !== 'cost-estimate') throw new SimulationError('UNKNOWN_POLICY', `assignment policy ${String(policy)} is not supported`);
  const open = [...jobs];
  while (open.length > 0 && robots.length > 0) {
    let best: { job: JobSpec; robot: AssignableRobot; cost: number } | null = null;
    for (const job of open) for (const robot of robots) {
      if (!eligible(job, robot, ctx)) continue;
      const cost = estimateCost(job, robot, ctx);
      if (!best || cost < best.cost || (cost === best.cost && (byId(robot.id, best.robot.id) < 0 || (robot.id === best.robot.id && byId(job.id, best.job.id) < 0)))) best = { job, robot, cost };
    }
    if (!best) break;
    out.push({ jobId: best.job.id, robotId: best.robot.id });
    open.splice(open.indexOf(best.job), 1);
    robots.splice(robots.indexOf(best.robot), 1);
  }
  return out;
}
