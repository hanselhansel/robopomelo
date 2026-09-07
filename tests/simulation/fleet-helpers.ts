import type { Pose, RobotProfile } from '@robopomelo/spec';
import { expect } from 'vitest';
import type { FleetInput, FleetLimits, FleetResult, FleetRobot, FleetStation, Policy, RunIdentity } from '../../packages/simulation/src/fleet-types.js';
import type { JobSpec } from '../../packages/simulation/src/jobs.js';
import { assertTaskConservation } from '../../packages/simulation/src/metrics.js';
import { activeFootprint } from '../../packages/simulation/src/motion.js';
import { runFleet } from '../../packages/simulation/src/fleet.js';
import { polygonsOverlap, transformPolygon } from '../../packages/simulation/src/sweep.js';
import { DEFAULT_TOLERANCES, type Polygon, type StaticObstacle, type Tolerances } from '../../packages/simulation/src/types.js';

export const TOL: Tolerances = { ...DEFAULT_TOLERANCES, gridM: 0.5 };
export const rect = (hx: number, hy: number): Polygon => [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
export const pose = (xM: number, yM: number, yawRad = 0): Pose => ({ xM, yM, zM: 0, yawRad });
export const box = (id: string, x0: number, x1: number, y0: number, y1: number): StaticObstacle => ({ id, polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], zMinM: 0, zMaxM: 3 });
/** Small differential robot (0.6 x 0.4 m, loaded 0.8 x 0.6 m) that fits a 1 m lane. */
export const diff = (over: Partial<RobotProfile> = {}): RobotProfile => ({
  id: 'diff', drive: 'differential', footprintM: rect(0.3, 0.2), loadedFootprintM: rect(0.4, 0.3), heightM: 1,
  maxSpeedMps: 1, maxAngularRadps: Math.PI, accelerationMps2: 1, decelerationMps2: 1, reverse: false, ...over,
});
export const omni = (over: Partial<RobotProfile> = {}): RobotProfile => ({ ...diff(), id: 'omni', drive: 'omnidirectional', reverse: true, ...over });
export const station = (id: string, kind: FleetStation['kind'], p: Pose, capacity = 1): FleetStation => ({ id, instanceId: id, kind, capacity, pose: p });
export const job = (id: string, releaseTick: number, from: string, to: string, priority = 0): JobSpec => ({ id, releaseTick, fromStationId: from, toStationId: to, priority });
export const identity: RunIdentity = { sourceRevision: 'rev', sourceHash: 'h', runId: 'run', inputHash: 'in', workloadHash: 'wl', assetHashes: [] };
export const policy: Policy = { name: 'fifo-nearest', version: '1' };

export type Scenario = {
  obstacles?: StaticObstacle[]; bounds: FleetInput['bounds']; robots: FleetRobot[]; profiles?: RobotProfile[]; stations: FleetStation[]; jobs: JobSpec[];
  policy?: Policy; tuning?: FleetInput['tuning']; tolerances?: Tolerances; seed?: number;
};
export const LIMITS: FleetLimits = { maxTicks: 2000, maxExpansionsPerRoute: 20000, replanBudgetPerRobot: 2 };

export function run(s: Scenario, limits: Partial<FleetLimits> = {}): FleetResult {
  const input: FleetInput = {
    identity, obstacles: s.obstacles ?? [], bounds: s.bounds, robots: s.robots, profiles: s.profiles ?? [diff(), omni()], stations: s.stations,
    workload: null, jobs: s.jobs, policy: s.policy ?? policy, seed: s.seed ?? 7, tolerances: s.tolerances ?? TOL, tuning: { serviceTicks: 5, retryTicks: 5, ...s.tuning },
  };
  return runFleet(input, { ...LIMITS, ...limits });
}

export function conserved(r: FleetResult): void {
  const c = r.ledger;
  assertTaskConservation(c.released, [c.queued, c.active, c.completed, c.failed, c.cancelled]);
}

export function monotone(r: FleetResult): void {
  for (let i = 0; i < r.events.length; i++) {
    expect(r.events[i]!.sequence).toBe(i);
    if (i > 0) expect(r.events[i]!.tick).toBeGreaterThanOrEqual(r.events[i - 1]!.tick);
  }
}

/** Pose of a robot at a tick from its committed legs (last step at or before the tick). */
export function poseAt(r: FleetResult, robotId: string, tick: number, start: Pose): { pose: Pose; loaded: boolean } {
  const robot = r.robots.find((x) => x.id === robotId)!;
  let current = start, loaded = false;
  for (const leg of robot.legs) {
    if (leg.departTick > tick) break;
    loaded = leg.start.loaded;
    current = leg.start.pose;
    for (const step of leg.steps) if (step.tick <= tick) current = step.pose;
  }
  return { pose: current, loaded };
}

/** Independent check: no two robots' standing footprints overlap at any sampled tick. */
export function noRobotOverlap(r: FleetResult, robots: FleetRobot[], profiles: RobotProfile[], every = 1): void {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  for (let tick = 0; tick <= r.manifest.durationTicks; tick += every) {
    const placed = robots.map((robot) => {
      const at = poseAt(r, robot.id, tick, robot.pose);
      return { id: robot.id, polygon: transformPolygon(activeFootprint(byId.get(robot.profileId)!, at.loaded), at.pose) };
    });
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++)
      expect(polygonsOverlap(placed[i]!.polygon, placed[j]!.polygon), `${placed[i]!.id} overlaps ${placed[j]!.id} at tick ${tick}`).toBe(false);
  }
}
