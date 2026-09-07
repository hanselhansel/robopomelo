import { describe, expect, it } from 'vitest';
import { findWaitCycles } from '../../packages/simulation/src/wait-graph.js';
import { box, conserved, diff, job, monotone, pose, run, station } from './fleet-helpers.js';

describe('findWaitCycles', () => {
  it('returns the robots and resources of a two-robot cycle and ignores chains', () => {
    const cycles = findWaitCycles([
      { robotId: 'b', blockerId: 'a', resourceId: 'c:1,1' },
      { robotId: 'a', blockerId: 'b', resourceId: 'c:2,2' },
      { robotId: 'z', blockerId: 'a', resourceId: 'c:9,9' },
    ]);
    expect(cycles).toEqual([{ robotIds: ['a', 'b'], resourceIds: ['c:1,1', 'c:2,2'] }]);
  });
  it('finds longer cycles once, in canonical order, and reports none for acyclic graphs', () => {
    const ring = ['r1', 'r2', 'r3'].map((id, i, all) => ({ robotId: id, blockerId: all[(i + 1) % all.length]!, resourceId: `s:${id}` }));
    expect(findWaitCycles([...ring].reverse())).toEqual([{ robotIds: ['r1', 'r2', 'r3'], resourceIds: ['s:r1', 's:r2', 's:r3'] }]);
    expect(findWaitCycles([{ robotId: 'a', blockerId: 'b', resourceId: 'x' }, { robotId: 'b', blockerId: 'c', resourceId: 'y' }])).toEqual([]);
    expect(findWaitCycles([{ robotId: 'a', blockerId: 'a', resourceId: 'x' }])).toEqual([]);
  });
});

describe('unresolvable deadlock', () => {
  /** One-cell corridor (0.7 m wide): a 0.6 x 0.4 m differential robot cannot turn around inside it. */
  const corridor = [box('north', 0, 16, 5.35, 10), box('south', 0, 16, 0, 4.65)];
  const bounds = { minXM: 0, maxXM: 16, minYM: 0, maxYM: 10 };
  /** A faces east and must reach the east end; B (low battery, charger-only) faces west and must reach the west charger. */
  const robots = [
    { id: 'A', profileId: 'diff', pose: pose(3, 5, 0) },
    { id: 'B', profileId: 'diff', pose: pose(13, 5, Math.PI), lowBattery: true },
  ];
  const stations = [station('pe', 'pickup', pose(14, 5, 0)), station('de', 'dropoff', pose(15, 5, 0)), station('cw', 'charger', pose(2, 5, Math.PI))];
  const jobs = [job('ja', 0, 'pe', 'de'), job('jb', 0, 'cw', 'cw')];
  it('terminates with deadlock naming both robots and the contested cells, retaining both jobs', () => {
    const result = run({ obstacles: corridor, bounds, robots, profiles: [diff({ reverse: false })], stations, jobs }, { replanBudgetPerRobot: 1 });
    expect(result.events.filter((e) => e.kind === 'assigned').map((e) => `${e.robotId}:${e.taskId}`)).toEqual(['A:ja', 'B:jb']);
    expect(result.termination).toBe('deadlock');
    expect(result.manifest.termination).toBe('deadlock');
    expect(result.unresolved?.robotIds).toEqual(['A', 'B']);
    expect(result.unresolved?.resourceIds.length).toBeGreaterThan(0);
    expect(result.unresolved?.resourceIds.every((id) => id.startsWith('c:'))).toBe(true);
    const deadlockEvents = result.events.filter((e) => e.kind === 'deadlock');
    expect(deadlockEvents.map((e) => e.robotId)).toEqual(['A', 'B']);
    expect(deadlockEvents.every((e) => e.resourceId && result.unresolved!.resourceIds.includes(e.resourceId))).toBe(true);
    // Uncompleted tasks are retained, never dropped.
    expect(result.ledger.active).toBe(2);
    expect(result.ledger.completed + result.ledger.failed + result.ledger.cancelled).toBe(0);
    conserved(result); monotone(result);
    expect(result.metrics.partial).toBe(true);
    expect(result.manifest.durationTicks).toBeLessThan(200);
  });
  it('resolves the same head-on encounter when a holding pocket offers a verified backtrack pose', () => {
    // A 2 m wide plaza at x = 8 with a holding pose north of the lane: the first robot to exhaust
    // its patience turns off into it (route verified by S4 and reserved), the other passes, then it resumes.
    const pocket = [box('north-w', 0, 7, 5.35, 10), box('north-e', 9, 16, 5.35, 10), box('south-w', 0, 7, 0, 4.65), box('south-e', 9, 16, 0, 4.65), box('plaza-top', 7, 9, 7.5, 10), box('plaza-bottom', 7, 9, 0, 3)];
    const result = run({ obstacles: pocket, bounds, robots, stations: [...stations, station('hold', 'holding', pose(8, 6.5, Math.PI / 2))], jobs }, { maxTicks: 1500 });
    expect(result.termination).toBe('completed');
    expect(result.ledger.completed).toBe(2);
    expect(result.events.some((e) => e.kind === 'moving' && e.reason.startsWith('retreat'))).toBe(true);
    conserved(result); monotone(result);
  });
});
