import { expect, it } from 'vitest';
import type { RobotProfile, SpatialExtension } from '@robopomelo/spec';
import fixture from '../../fixtures/fleet-50.json';
import { compareRobotIds } from '../../packages/simulation/src/clock.js';
import { runFleet } from '../../packages/simulation/src/fleet.js';
import type { FleetInput } from '../../packages/simulation/src/fleet-types.js';
import { assertTaskConservation } from '../../packages/simulation/src/metrics.js';
import { floorBounds, sceneObstacles, servicePoses, snapPose } from '../../packages/simulation/src/stations.js';
import { checkTrace } from '../../packages/simulation/src/trace-check.js';
import { DEFAULT_TOLERANCES } from '../../packages/simulation/src/types.js';
import { identity } from './fleet-helpers.js';

const spatial = fixture.spatial as unknown as SpatialExtension;
const scene = spatial.scenes[0]!, scenario = spatial.scenarios[0]!;
/** Versioned inputs of this run: 0.5 m lattice with 8 headings (fixture poses are snapped to it)
 * and weighted A* with factor 2 (bounded-suboptimal routes, far fewer expansions in the rack maze). */
const tol = { ...DEFAULT_TOLERANCES, gridM: 0.5 };
const tuning = { heuristicWeight: 2 };
const profiles = spatial.robotProfiles as RobotProfile[];
const robotIds = new Set(fixture.robots.map((r) => r.instanceId));
const obstacles = sceneObstacles(scene, robotIds);
const bounds = floorBounds(scene);
const stations = servicePoses(scene, scenario.stations, profiles, obstacles, bounds, tol);
const robots = fixture.robots.map((r) => ({ id: r.instanceId, profileId: r.profileId, pose: snapPose(scene.instances.find((i) => i.id === r.instanceId)!.pose, tol) }));
const input: FleetInput = { identity, obstacles, bounds, robots, profiles, stations, workload: scenario.workload, policy: { name: 'fifo-nearest', version: '1' }, seed: scenario.workload!.seed, tolerances: tol, tuning };

it('runs a bounded 600-tick slice of the synthetic 50-robot workload with conservation, ordered events and clean traces', () => {
  expect(stations).toHaveLength(28);
  const t0 = performance.now();
  const r = runFleet(input, { maxTicks: 600, maxExpansionsPerRoute: 20000, replanBudgetPerRobot: 2 });
  const wallMs = performance.now() - t0;
  // Bounded run: it must stop on the tick budget and be labelled partial. It does not claim the 1,000-job horizon.
  expect(r.termination).toBe('budget');
  expect(r.manifest.durationTicks).toBe(600);
  expect(r.metrics.partial).toBe(true);
  expect(r.metrics.horizonTicks).toBe(600);
  const c = r.ledger;
  assertTaskConservation(c.released, [c.queued, c.active, c.completed, c.failed, c.cancelled]);
  expect(c.released).toBeGreaterThan(0);
  expect(c.released).toBeLessThan(1000);
  for (let i = 0; i < r.events.length; i++) {
    expect(r.events[i]!.sequence).toBe(i);
    if (i === 0) continue;
    expect(r.events[i]!.tick).toBeGreaterThanOrEqual(r.events[i - 1]!.tick);
    if (r.events[i]!.tick === r.events[i - 1]!.tick) expect(compareRobotIds(r.events[i - 1]!.robotId, r.events[i]!.robotId)).toBeLessThanOrEqual(0);
  }
  let legs = 0;
  for (const robot of r.robots) {
    const profile = profiles.find((p) => p.id === robot.profileId)!;
    for (const leg of robot.legs) {
      legs++;
      expect(checkTrace(profile, leg.start, leg.steps, obstacles, tol), `${robot.id} leg ${leg.departTick}`).toMatchObject({ ok: true });
    }
  }
  expect(legs).toBeGreaterThan(0);
  expect(r.manifest.eventSha256).toMatch(/^[0-9a-f]{64}$/);
  console.log(`fleet-50 bounded run: ${wallMs.toFixed(0)} ms wall (informal), released=${c.released} active=${c.active} completed=${c.completed} failed=${c.failed} legs=${legs} events=${r.events.length}`);
});
