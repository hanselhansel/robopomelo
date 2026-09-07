/** S2b feasibility probe. Plans one route per robot from its parked pose to a
 * station on the synthetic fleet-50 fixture, then re-validates every path with
 * the independent trace checker. Reports expansions, timings and memory. These
 * are informal host measurements, not the S6 acceptance benchmark. */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { os, hardware } from './host.js';
import fixture from '../../fixtures/fleet-50.json';
import type { Instance, RobotProfile, SpatialExtension } from '@robopomelo/spec';
import { DEFAULT_TOLERANCES, POLICY_VERSION, checkTrace, findRoute, obstacleFromInstance, xorshift32, type StaticObstacle } from '@robopomelo/simulation';
const report = process.argv.indexOf('--report') >= 0 ? process.argv[process.argv.indexOf('--report') + 1] : undefined;
const spatial = fixture.spatial as unknown as SpatialExtension;
const scene = spatial.scenes[0]!, scenario = spatial.scenarios[0]!;
const grid = DEFAULT_TOLERANCES.gridM;
const snap = (v: number) => Math.round(v / grid) * grid;
const robots = fixture.robots as { instanceId: string; profileId: string }[];
const obstacles: StaticObstacle[] = scene.instances.filter((i: Instance) => !i.id.startsWith('robot-')).map(obstacleFromInstance).filter((o): o is StaticObstacle => o !== null);
const profiles = new Map(spatial.robotProfiles.map((p: RobotProfile) => [p.id, p]));
const stations = scenario.stations.filter((s) => s.kind === 'pickup' || s.kind === 'dropoff');
const instanceById = new Map(scene.instances.map((i: Instance) => [i.id, i]));
const random = xorshift32(scenario.workload!.seed);
const floor = scene.floor.state === 'known' ? scene.floor.value : { lengthM: 120, widthM: 60 };
const bounds = { minXM: 0, maxXM: floor.lengthM, minYM: 0, maxYM: floor.widthM };
const rows: Record<string, unknown>[] = [];
const started = performance.now(); const memoryBefore = process.memoryUsage().rss;
let planned = 0, unresolved = 0, infeasible = 0, checked = 0, conflicts = 0, planMs = 0, checkMs = 0, expansions = 0;
for (const robot of robots) {
  const instance = instanceById.get(robot.instanceId)!, profile = profiles.get(robot.profileId)!;
  const station = stations[Math.floor(random() * stations.length)]!;
  const target = instanceById.get(station.instanceId)!;
  // Approach pose: one grid cell in front of the station, facing it.
  const goal = { pose: { xM: snap(target.pose.xM + (target.pose.xM < 60 ? 2 : -2)), yM: snap(target.pose.yM), zM: 0, yawRad: target.pose.xM < 60 ? Math.PI : 0 }, transition: 'none' as const };
  const start = { profileId: profile.id, pose: { xM: snap(instance.pose.xM), yM: snap(instance.pose.yM), zM: 0, yawRad: 0 }, loaded: false };
  const t0 = performance.now();
  const result = findRoute(profile, start, goal, obstacles, { bounds, tolerances: DEFAULT_TOLERANCES, expansionLimit: 60_000 });
  const t1 = performance.now(); planMs += t1 - t0; expansions += result.expansions;
  let verdict: string | null = null;
  if (result.kind === 'path') {
    planned++;
    const c0 = performance.now();
    const trace = checkTrace(profile, start, result.steps, obstacles, DEFAULT_TOLERANCES);
    checkMs += performance.now() - c0; checked++;
    verdict = trace.ok ? 'ok' : trace.code; if (!trace.ok) conflicts++;
  } else if (result.kind === 'unresolved') unresolved++; else infeasible++;
  rows.push({ robot: robot.instanceId, profile: profile.id, station: station.id, kind: result.kind, reason: 'reason' in result ? result.reason : null, expansions: result.expansions, steps: result.kind === 'path' ? result.steps.length : 0, ticks: result.kind === 'path' ? result.ticks : null, planMs: Math.round((t1 - t0) * 100) / 100, verdict });
}
const output = {
  probe: 'fleet-feasibility', policyVersion: POLICY_VERSION, fixture: 'fixtures/fleet-50.json', note: fixture.note,
  host: { os: os(), hardware: hardware(), node: process.version, wall: new Date().toISOString() },
  tolerances: DEFAULT_TOLERANCES, obstacles: obstacles.length, robots: robots.length,
  summary: { planned, unresolved, infeasible, checked, conflicts, expansions, planMs: Math.round(planMs), checkMs: Math.round(checkMs), totalMs: Math.round(performance.now() - started), rssDeltaMiB: Math.round((process.memoryUsage().rss - memoryBefore) / 1048576) },
  rows,
};
if (report) writeFileSync(report, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output.summary));
if (conflicts) process.exitCode = 1;
