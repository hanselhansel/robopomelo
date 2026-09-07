/** Inline (same-thread) fleet run for CPU profiling. Not a benchmark. */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { RobotProfile, SpatialExtension } from '@robopomelo/spec';
import { DEFAULT_TOLERANCES, floorBounds, runFleet, sceneObstacles, servicePoses, snapPose, type FleetInput } from '@robopomelo/simulation';
const fixture = JSON.parse(readFileSync('fixtures/fleet-50.json', 'utf8')) as { robots: { instanceId: string; profileId: string }[]; spatial: SpatialExtension };
const spatial = fixture.spatial, scene = spatial.scenes[0]!, scenario = spatial.scenarios[0]!;
const tol = { ...DEFAULT_TOLERANCES, gridM: 0.5 };
const profiles = spatial.robotProfiles as RobotProfile[];
const robotIds = new Set(fixture.robots.map((r) => r.instanceId));
const obstacles = sceneObstacles(scene, robotIds), bounds = floorBounds(scene);
const stations = servicePoses(scene, scenario.stations, profiles, obstacles, bounds, tol);
const robots = fixture.robots.map((r) => ({ id: r.instanceId, profileId: r.profileId, pose: snapPose(scene.instances.find((i) => i.id === r.instanceId)!.pose, tol) }));
const identity = { sourceRevision: 'fixture', sourceHash: '0'.repeat(64), runId: 'profile', inputHash: '0'.repeat(64), workloadHash: '0'.repeat(64), assetHashes: [] as string[] };
const input: FleetInput = { identity, obstacles, bounds, robots, profiles, stations, workload: scenario.workload, policy: { name: 'fifo-nearest', version: '1' }, seed: scenario.workload!.seed, tolerances: tol, tuning: { heuristicWeight: 2 } };
const ticks = Number(process.argv[2] ?? '1500');
const t0 = performance.now();
const result = runFleet(input, { maxTicks: ticks, maxExpansionsPerRoute: 20_000, replanBudgetPerRobot: 2 });
console.log(JSON.stringify({ ticks: result.manifest.durationTicks, termination: result.termination, wallMs: Math.round(performance.now() - t0), events: result.events.length, completed: result.ledger.completed }));
