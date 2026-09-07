/** S6 fleet benchmark. Runs the synthetic fleet-50 fixture for a 30 minute
 * simulated horizon (18,000 ticks) in the real worker-thread strategy under a
 * 60 s host wall deadline, then a short cancel probe. Reports wall time, ticks
 * reached, termination, jobs, memory and the plan targets it can measure on this
 * host. Renderer targets (frame time, edit feedback, pause acknowledgment) are
 * reported as not measured, never as passed. Informal host measurements. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { RobotProfile, SpatialExtension } from '@robopomelo/spec';
import { DEFAULT_TOLERANCES, ENGINE_VERSION, floorBounds, sceneObstacles, servicePoses, snapPose, type FleetInput } from '@robopomelo/simulation';
import { SimulationRunner, workerStrategy } from '../../packages/application/src/simulation/worker.js';
import { hardware, os } from './host.js';
const arg = (name: string, fallback: string): string => { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback; };
const fixturePath = arg('--fixture', 'fixtures/fleet-50.json'), report = arg('--report', ''), wallMs = Number(arg('--wall-ms', '60000')), maxTicks = Number(arg('--ticks', '18000'));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { note: string; robots: { instanceId: string; profileId: string }[]; spatial: SpatialExtension };
const spatial = fixture.spatial, scene = spatial.scenes[0]!, scenario = spatial.scenarios[0]!;
const tol = { ...DEFAULT_TOLERANCES, gridM: 0.5 }, tuning = { heuristicWeight: 2 };
const profiles = spatial.robotProfiles as RobotProfile[];
const robotIds = new Set(fixture.robots.map((r) => r.instanceId));
const obstacles = sceneObstacles(scene, robotIds), bounds = floorBounds(scene);
const stations = servicePoses(scene, scenario.stations, profiles, obstacles, bounds, tol);
const robots = fixture.robots.map((r) => ({ id: r.instanceId, profileId: r.profileId, pose: snapPose(scene.instances.find((i) => i.id === r.instanceId)!.pose, tol) }));
const identity = { sourceRevision: 'fixture', sourceHash: '0'.repeat(64), runId: 'benchmark', inputHash: '0'.repeat(64), workloadHash: '0'.repeat(64), assetHashes: [] as string[] };
const input: FleetInput = { identity, obstacles, bounds, robots, profiles, stations, workload: scenario.workload, policy: { name: 'fifo-nearest', version: '1' }, seed: scenario.workload!.seed, tolerances: tol, tuning };
const limits = { maxTicks, maxExpansionsPerRoute: 20_000, replanBudgetPerRobot: 2 };
const mib = (bytes: number) => Math.round(bytes / 1048576);
let peakRss = process.memoryUsage().rss;
const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 100);

// Main run: full horizon under the wall deadline.
const runner = new SimulationRunner({ strategy: workerStrategy() });
let lastTick = 0;
const t0 = performance.now();
const main = await runner.run({ input, limits, wallMs }, (tick) => { lastTick = tick; });
const mainWallMs = performance.now() - t0;
const stopLatencyMain = main.stoppedBy === 'deadline' ? mainWallMs - wallMs : null;

// Cancel probe: start again, cancel after one second, measure how long the worker takes to hand back its partial result.
const probe = new SimulationRunner({ strategy: workerStrategy() });
const cancelAfterMs = 1000;
const started = performance.now();
const pending = probe.run({ input, limits, wallMs });
await new Promise((r) => setTimeout(r, cancelAfterMs));
const cancelAt = performance.now();
probe.cancel();
const cancelled = await pending;
const stopLatencyMs = performance.now() - cancelAt;
clearInterval(sampler);
peakRss = Math.max(peakRss, process.memoryUsage().rss);

const targets = [
  { id: 'horizon-wall', text: 'deterministic 30 minute horizon (18,000 ticks) within 60 s wall time', target: `${maxTicks} ticks in <= ${wallMs} ms`, measured: `${main.result.manifest.durationTicks} ticks in ${Math.round(mainWallMs)} ms, termination ${main.result.termination}`, pass: main.result.manifest.durationTicks >= maxTicks && mainWallMs <= wallMs && main.result.termination !== 'cancelled' && main.result.termination !== 'invalid' },
  { id: 'worker-stop', text: 'worker stops within 2 seconds of cancel', target: '<= 2000 ms', measured: `${Math.round(stopLatencyMs)} ms after cancel${stopLatencyMain !== null ? `; ${Math.round(stopLatencyMain)} ms after the deadline in the main run` : ''}`, pass: stopLatencyMs <= 2000 && cancelled.result.termination === 'cancelled' && (stopLatencyMain === null || stopLatencyMain <= 2000) },
  { id: 'resident-memory', text: 'total resident memory <= 1.5 GiB for the reference workload', target: '<= 1536 MiB (host process including worker threads)', measured: `${mib(peakRss)} MiB peak rss`, pass: peakRss <= 1.5 * 1024 * 1048576 },
  { id: 'frame-time', text: '30 fps, p95 frame time <= 33 ms in the 50-robot scene at 1280x800', target: '<= 33 ms p95', measured: 'not measured by this script (needs the desktop renderer)', pass: null },
  { id: 'edit-feedback', text: 'p95 direct edit feedback <= 100 ms', target: '<= 100 ms p95', measured: 'not measured by this script', pass: null },
  { id: 'pause-ack', text: 'UI pause acknowledgment <= 250 ms', target: '<= 250 ms', measured: 'not measured by this script', pass: null },
];
const output = {
  benchmark: 'fleet-benchmark', engineVersion: ENGINE_VERSION, fixture: fixturePath, note: fixture.note,
  host: { os: os(), hardware: hardware(), node: process.version, wall: new Date().toISOString() },
  inputs: { robots: robots.length, stations: stations.length, obstacles: obstacles.length, jobs: scenario.workload!.jobs, tolerances: tol, tuning, limits, wallMs },
  main: { wallMs: Math.round(mainWallMs), ticks: main.result.manifest.durationTicks, lastProgressTick: lastTick, termination: main.result.termination, reason: main.result.reason, stoppedBy: main.stoppedBy, ledger: main.result.ledger, events: main.result.events.length, throughputPerHour: Math.round(main.result.metrics.throughputPerHour * 10) / 10, partial: main.result.metrics.partial },
  cancelProbe: { cancelAfterMs, runningForMs: Math.round(cancelAt - started), stopLatencyMs: Math.round(stopLatencyMs), ticks: cancelled.result.manifest.durationTicks, termination: cancelled.result.termination, ledger: cancelled.result.ledger },
  memory: { peakRssMiB: mib(peakRss) },
  targets, pass: targets.every((t) => t.pass !== false), unmeasured: targets.filter((t) => t.pass === null).map((t) => t.id),
};
if (report) { mkdirSync(dirname(report), { recursive: true }); writeFileSync(report, JSON.stringify(output, null, 2) + '\n'); }
console.log(JSON.stringify({ main: output.main, cancelProbe: output.cancelProbe, memory: output.memory, targets: targets.map((t) => `${t.id}: ${t.pass === null ? 'not measured' : t.pass ? 'pass' : 'FAIL'} (${t.measured})`), pass: output.pass }, null, 2));
if (!output.pass) process.exitCode = 1;
