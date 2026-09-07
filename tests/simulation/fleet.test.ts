import { describe, expect, it } from 'vitest';
import type { Workload } from '@robopomelo/spec';
import { compareRobotIds } from '../../packages/simulation/src/clock.js';
import type { FleetResult } from '../../packages/simulation/src/fleet-types.js';
import { JobLedger, generateJobs } from '../../packages/simulation/src/jobs.js';
import { checkTrace } from '../../packages/simulation/src/trace-check.js';
import { TOL, box, conserved, diff, job, monotone, noRobotOverlap, omni, pose, run, station, type Scenario } from './fleet-helpers.js';

const profiles = [diff(), omni()];
/** 20 x 12 m floor with a central rack; pickups west, dropoffs east, a holding pose and a charger south. */
const rack = [box('rack', 8, 12, 4, 8)];
const bounds = { minXM: 0, maxXM: 20, minYM: 0, maxYM: 12 };
const stations = [
  station('p1', 'pickup', pose(2, 3, Math.PI)), station('p2', 'pickup', pose(2, 6, Math.PI)), station('p3', 'pickup', pose(2, 9, Math.PI)),
  station('d1', 'dropoff', pose(18, 4, 0)), station('d2', 'dropoff', pose(18, 8, 0)),
  ...[4, 6, 8, 10, 12, 14].map((x, i) => station(`h${i + 1}`, 'holding', pose(x, 10.5, Math.PI / 2))),
  station('c1', 'charger', pose(10, 1.5, 0)),
];
const sixRobots = [0, 1, 2].flatMap((i) => [
  { id: `d${i}`, profileId: 'diff', pose: pose(6 + 3 * i, 1, Math.PI / 2) },
  { id: `o${i}`, profileId: 'omni', pose: pose(7.5 + 3 * i, 1, Math.PI / 2) },
]);
const transport = (n: number, every: number) => Array.from({ length: n }, (_, i) => job(`j${String(i).padStart(2, '0')}`, i * every, `p${(i % 3) + 1}`, `d${(i % 2) + 1}`));
const sixRobotScenario: Scenario = { obstacles: rack, bounds, robots: sixRobots, profiles, stations, jobs: transport(12, 40) };

function stableWithinTick(r: FleetResult): void {
  for (let i = 1; i < r.events.length; i++) {
    const a = r.events[i - 1]!, b = r.events[i]!;
    if (a.tick === b.tick) expect(compareRobotIds(a.robotId, b.robotId)).toBeLessThanOrEqual(0);
  }
}

describe('runFleet', () => {
  it('completes a 6-robot fixture with conserved tasks, ordered events, collision-free traces and a manifest', () => {
    const r = run(sixRobotScenario, { maxTicks: 4000 });
    expect(r.termination).toBe('completed');
    expect(r.ledger).toMatchObject({ released: 12, completed: 12, queued: 0, active: 0, failed: 0, cancelled: 0 });
    conserved(r); monotone(r); stableWithinTick(r);
    noRobotOverlap(r, sixRobots, profiles);
    for (const robot of r.robots) {
      const profile = profiles.find((p) => p.id === robot.profileId)!;
      for (const leg of robot.legs) expect(checkTrace(profile, leg.start, leg.steps, rack, TOL)).toMatchObject({ ok: true });
    }
    expect(r.manifest).toMatchObject({ formatVersion: '1.0.0', policyVersion: 'fifo-nearest/1', termination: 'completed', eventCount: r.events.length, runId: 'run', sourceRevision: 'rev' });
    expect(r.manifest.eventSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.manifest.durationTicks).toBeGreaterThan(0);
    expect(r.metrics.partial).toBe(false);
    expect(r.metrics.completedJobs).toBe(12);
  });
  it('is deterministic: identical inputs give identical events and hashes; another seed differs', () => {
    const a = run(sixRobotScenario, { maxTicks: 4000 }), b = run(sixRobotScenario, { maxTicks: 4000 });
    expect(b.events).toEqual(a.events);
    expect(b.manifest.eventSha256).toBe(a.manifest.eventSha256);
    const workload: Workload = { seed: 424242, jobs: 10, arrivalsPerHour: 900, mix: [{ fromStationId: 'p1', toStationId: 'd1', share: 0.5 }, { fromStationId: 'p2', toStationId: 'd2', share: 0.5 }] };
    const w1 = generateJobs(workload, stations), w2 = generateJobs({ ...workload, seed: 5 }, stations);
    expect(generateJobs(workload, stations)).toEqual(w1);
    expect(w1.map((j) => j.releaseTick)).not.toEqual(w2.map((j) => j.releaseTick));
  });
  it('supports the cost-estimate policy under the same interface and records its version', () => {
    const r = run({ ...sixRobotScenario, policy: { name: 'cost-estimate', version: '2' } }, { maxTicks: 4000 });
    expect(r.termination).toBe('completed');
    expect(r.ledger.completed).toBe(12);
    expect(r.manifest.policyVersion).toBe('cost-estimate/2');
    conserved(r);
  });
  it('prevents starvation by aging: a low-priority job completes while high-priority jobs keep arriving', () => {
    const open = { minXM: 0, maxXM: 10, minYM: 0, maxYM: 10 };
    const s = [station('P', 'pickup', pose(2, 5, Math.PI)), station('D', 'dropoff', pose(8, 5, 0))];
    const jobs = [job('low', 0, 'P', 'D', 0), ...Array.from({ length: 60 }, (_, i) => job(`high${String(i).padStart(2, '0')}`, i * 40, 'P', 'D', 5))];
    const robots = [{ id: 'r', profileId: 'omni', pose: pose(5, 2) }];
    const aged = run({ bounds: open, robots, stations: s, jobs, tuning: { agingTicks: 100 } }, { maxTicks: 2400 });
    expect(aged.events.some((e) => e.kind === 'completed' && e.taskId === 'low' && e.reason === 'completed')).toBe(true);
    conserved(aged);
    const starved = run({ bounds: open, robots, stations: s, jobs, tuning: { agingTicks: 1_000_000 } }, { maxTicks: 2400 });
    expect(starved.termination).toBe('budget');
    expect(starved.events.some((e) => e.kind === 'assigned' && e.taskId === 'low')).toBe(false);
    expect(starved.metrics.partial).toBe(true);
    conserved(starved);
  });
  it('checks charging eligibility: a low-battery robot only takes charger jobs', () => {
    // The low-battery robot is nearer to the pickup, yet the transport job must go to the other robot.
    const robots = [{ id: 'low', profileId: 'omni', pose: pose(3, 1), lowBattery: true }, { id: 'ok', profileId: 'omni', pose: pose(6, 1) }];
    const jobs = [job('a-transport', 0, 'p1', 'd1'), job('b-charge', 0, 'h1', 'c1')];
    const r = run({ obstacles: rack, bounds, robots, profiles, stations, jobs }, { maxTicks: 3000 });
    const assigned = r.events.filter((e) => e.kind === 'assigned').map((e) => `${e.robotId}:${e.taskId}`);
    expect(assigned).toEqual(['low:b-charge', 'ok:a-transport']);
    expect(r.ledger.completed).toBe(2);
    conserved(r);
  });
  it('returns a job to queued when the assigned robot has no static route, then another robot completes it', () => {
    const cage = [box('cage-n', 0, 3, 2.5, 3), box('cage-s', 0, 3, 0, 0.5), box('cage-e', 2.5, 3, 0, 3)];
    const robots = [{ id: 'caged', profileId: 'omni', pose: pose(1, 1.5) }, { id: 'free', profileId: 'omni', pose: pose(9, 1) }];
    const s = [station('P', 'pickup', pose(1, 5, Math.PI)), station('D', 'dropoff', pose(8, 5, 0))];
    const r = run({ obstacles: cage, bounds: { minXM: 0, maxXM: 10, minYM: 0, maxYM: 10 }, robots, stations: s, jobs: [job('j', 0, 'P', 'D')] }, { maxTicks: 1000 });
    const kinds = r.events.filter((e) => e.taskId === 'j').map((e) => `${e.tick}:${e.robotId}:${e.kind}:${e.reason.split(' ')[0]}`);
    expect(kinds.slice(0, 3)).toEqual(['0:caged:assigned:released:0', '0:caged:waiting:rejected:ROUTE_EXHAUSTED', '1:free:assigned:released:0']);
    expect(r.ledger).toMatchObject({ released: 1, completed: 1 });
    conserved(r);
  });
  it('cancels on the host callback: open jobs move to cancelled and conservation holds', () => {
    let calls = 0;
    const r = run({ ...sixRobotScenario, jobs: transport(9, 0) }, { shouldStop: () => ++calls > 3 });
    expect(r.termination).toBe('cancelled');
    expect(r.manifest.durationTicks).toBe(3);
    expect(r.ledger).toMatchObject({ released: 9, cancelled: 9, queued: 0, active: 0, completed: 0 });
    expect(r.events.some((e) => e.kind === 'assigned')).toBe(true);
    conserved(r); monotone(r);
    expect(r.metrics.partial).toBe(true);
  });
  it('rejects invalid input with termination invalid and an explanatory reason', () => {
    const offLattice = run({ ...sixRobotScenario, robots: [{ id: 'x', profileId: 'diff', pose: pose(1.3, 1) }] });
    expect(offLattice.termination).toBe('invalid');
    expect(offLattice.reason).toMatch(/OFF_LATTICE/);
    expect(offLattice.ledger.released).toBe(0);
    expect(run({ ...sixRobotScenario, robots: [{ id: 'x', profileId: 'nope', pose: pose(1, 1) }] }).reason).toMatch(/UNKNOWN_PROFILE/);
    expect(run({ ...sixRobotScenario, jobs: [job('j', 0, 'p1', 'ghost')] }).reason).toMatch(/UNKNOWN_STATION/);
    expect(run({ ...sixRobotScenario, seed: 0 }).reason).toMatch(/INVALID_SEED/);
  });
});

describe('jobs', () => {
  it('generates exactly workload.jobs jobs with non-decreasing integer release ticks drawn from the mix', () => {
    const workload: Workload = { seed: 99, jobs: 200, arrivalsPerHour: 3600, mix: [{ fromStationId: 'p1', toStationId: 'd1', share: 3 }, { fromStationId: 'p2', toStationId: 'd2', share: 1 }] };
    const jobs = generateJobs(workload, stations);
    expect(jobs).toHaveLength(200);
    expect(new Set(jobs.map((j) => j.id)).size).toBe(200);
    for (let i = 0; i < jobs.length; i++) {
      expect(Number.isInteger(jobs[i]!.releaseTick)).toBe(true);
      if (i > 0) expect(jobs[i]!.releaseTick).toBeGreaterThanOrEqual(jobs[i - 1]!.releaseTick);
    }
    // 3600/h is one arrival per second = 10 ticks mean gap; 200 jobs land near 2000 ticks.
    expect(jobs.at(-1)!.releaseTick).toBeGreaterThan(1200);
    expect(jobs.at(-1)!.releaseTick).toBeLessThan(3000);
    const p1 = jobs.filter((j) => j.fromStationId === 'p1').length;
    expect(p1).toBeGreaterThan(120);
    expect(p1).toBeLessThan(180);
    expect(() => generateJobs({ ...workload, mix: [{ fromStationId: 'p1', toStationId: 'nope', share: 1 }] }, stations)).toThrow(/UNKNOWN_STATION|unknown station/);
  });
  it('validates every ledger transition and keeps exact counts', () => {
    const ledger = new JobLedger();
    ledger.release('a'); ledger.release('b'); ledger.release('c');
    expect(() => ledger.release('a')).toThrow(/already released/);
    ledger.transition('a', 'active'); ledger.transition('a', 'queued'); ledger.transition('a', 'active'); ledger.transition('a', 'completed');
    ledger.transition('b', 'active'); ledger.transition('b', 'failed');
    expect(() => ledger.transition('a', 'queued')).toThrow(/not allowed/);
    expect(() => ledger.transition('c', 'completed')).toThrow(/not allowed/);
    expect(() => ledger.transition('zzz', 'active')).toThrow(/never released/);
    expect(ledger.counts()).toEqual({ queued: 1, active: 0, completed: 1, failed: 1, cancelled: 0, released: 3 });
    expect(ledger.cancelOpen()).toEqual(['c']);
    expect(ledger.counts()).toMatchObject({ queued: 0, cancelled: 1, released: 3 });
  });
});
