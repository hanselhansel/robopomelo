import type { Pose } from '@robopomelo/spec';
import type { IsaacExportPlan } from './plan.js';
import { primName } from './usd.js';
/** `scenario.json`: the runtime contract for run.py. Goals follow the
 * simulation's job generator exactly so both modeling layers see the same job
 * sequence: xorshift32 seeded with the workload seed, two draws per job (the
 * inter-arrival gap, then the mix draw against cumulative shares; a draw past
 * the cumulative total takes the last row). Only the first
 * min(jobs, MAX_GOALS) jobs are exported; robots take goals round-robin in id order. */
export const MAX_GOALS = 20;
export const CONTROLLER = Object.freeze({ poseFeedback: 'measured', command: 'differential-wheel-velocities', teleportAfterInit: false } as const);
export const THRESHOLDS = Object.freeze({ finalPositionErrorM: 0.1, headingErrorRad: 0.15 } as const);
export const UNITS = Object.freeze({ length: 'm', time: 's', angle: 'rad', upAxis: 'Z', handedness: 'right' } as const);
/** Identical to packages/simulation/src/prng.ts; duplicated because this package may not import simulation. */
export function xorshift32(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('INVALID_SEED');
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
export type IsaacGoal = { jobId: string; robotId: string; fromStationId: string; toStationId: string };
export type SharedIntersection = { xM: number; yM: number; cellM: number } | null;
export function goalsFor(plan: IsaacExportPlan): IsaacGoal[] {
  const workload = plan.workload;
  if (!workload || plan.robots.length === 0) return [];
  const cumulative: number[] = [];
  let total = 0;
  for (const row of workload.mix) cumulative.push((total += row.share));
  const rng = xorshift32(workload.seed), goals: IsaacGoal[] = [], count = Math.min(workload.jobs, MAX_GOALS);
  for (let i = 0; i < count; i++) {
    rng();
    const draw = rng() * total;
    let index = cumulative.findIndex((c) => draw < c);
    if (index < 0) index = workload.mix.length - 1;
    const row = workload.mix[index]!;
    goals.push({ jobId: `job-${String(i).padStart(4, '0')}`, robotId: plan.robots[i % plan.robots.length]!.id, fromStationId: row.fromStationId, toStationId: row.toStationId });
  }
  return goals;
}
const round6 = (n: number): number => { const r = Math.round(n * 1e6) / 1e6; return r === 0 ? 0 : r; };
/** Where the two robots' straight-line approach segments (start -> first pickup) cross, if they do. */
export function sharedIntersection(plan: IsaacExportPlan, goals: readonly IsaacGoal[]): SharedIntersection {
  const segments: [Pose, Pose][] = [];
  for (const robot of plan.robots) {
    const first = goals.find((goal) => goal.robotId === robot.id);
    const station = first && plan.stations.find((row) => row.id === first.fromStationId);
    if (station) segments.push([robot.startPose, station.pose]);
  }
  if (segments.length !== 2) return null;
  const [[p, p2], [q, q2]] = segments as [[Pose, Pose], [Pose, Pose]];
  const rx = p2.xM - p.xM, ry = p2.yM - p.yM, sx = q2.xM - q.xM, sy = q2.yM - q.yM;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const dx = q.xM - p.xM, dy = q.yM - p.yM;
  const t = (dx * sy - dy * sx) / denom, u = (dx * ry - dy * rx) / denom, eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { xM: round6(p.xM + t * rx), yM: round6(p.yM + t * ry), cellM: 1 };
}
export function buildScenario(plan: IsaacExportPlan): Record<string, unknown> {
  const goals = goalsFor(plan);
  return {
    formatVersion: '1.0.0',
    target: plan.profile.targetId,
    mode: plan.mode,
    scenarioId: plan.scenarioId,
    sceneId: plan.sceneId,
    units: UNITS,
    floor: { lengthM: plan.floor.lengthM, widthM: plan.floor.widthM, state: plan.floor.state },
    stations: plan.stations.map((row) => ({ id: row.id, instanceId: row.instanceId, primName: primName(row.instanceId), kind: row.kind, pose: row.pose })),
    robots: plan.robots.map((row) => ({ id: row.id, primName: `robot_${primName(row.id)}`, profileId: row.profileId, drive: row.drive, targetRobot: row.targetRobot, usdRelativePath: row.usdRelativePath, startPose: row.startPose })),
    workload: plan.workload ? { seed: plan.workload.seed, jobs: plan.workload.jobs, arrivalsPerHour: plan.workload.arrivalsPerHour, exportedGoals: goals.length, rule: 'xorshift32(seed); per job: gap draw, then mix draw against cumulative shares; first min(jobs, 20) jobs; robots round-robin by id' } : null,
    goals,
    sharedIntersection: sharedIntersection(plan, goals),
    controller: CONTROLLER,
    thresholds: THRESHOLDS,
    remainingSetup: plan.remainingSetup,
  };
}
