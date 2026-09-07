import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../packages/simulation/src/fleet-types.js';
import { assertTaskConservation, computeMetrics } from '../../packages/simulation/src/metrics.js';
import { TICK_MS } from '../../packages/simulation/src/types.js';

describe('assertTaskConservation', () => {
  it('accepts counts that sum to the released total', () => {
    expect(() => assertTaskConservation(0, [0, 0, 0, 0, 0])).not.toThrow();
    expect(() => assertTaskConservation(10, [2, 3, 4, 1, 0])).not.toThrow();
  });
  it('throws TASK_ACCOUNTING for a lost job, a duplicated job, negatives or non-integers', () => {
    expect(() => assertTaskConservation(10, [2, 3, 4, 0, 0])).toThrow('TASK_ACCOUNTING');
    expect(() => assertTaskConservation(10, [2, 3, 4, 1, 1])).toThrow('TASK_ACCOUNTING');
    expect(() => assertTaskConservation(10, [11, -1, 0, 0, 0])).toThrow('TASK_ACCOUNTING');
    expect(() => assertTaskConservation(1.5, [1.5])).toThrow('TASK_ACCOUNTING');
    expect(() => assertTaskConservation(-1, [])).toThrow('TASK_ACCOUNTING');
    expect(() => assertTaskConservation(Number.MAX_SAFE_INTEGER + 2, [Number.MAX_SAFE_INTEGER + 2])).toThrow('TASK_ACCOUNTING');
  });
});

const ev = (tick: number, robotId: string, kind: SimEvent['kind'], taskId: string | null, reason: string, resourceId: string | null = null): SimEvent =>
  ({ tick, sequence: 0, robotId, kind, taskId, resourceId, reason });
const events: SimEvent[] = [
  ev(0, 'a', 'assigned', 'j1', 'released:0 priority:0'),
  ev(0, 'a', 'moving', 'j1', 'depart:0 arrive:100'),
  ev(100, 'a', 'loading', 'j1', 'until:120', 'p'),
  ev(100, 'a', 'moving', 'j1', 'depart:120 arrive:300'),
  ev(300, 'a', 'loading', 'j1', 'until:320', 'd'),
  ev(320, 'a', 'completed', 'j1', 'completed', 'd'),
  ev(10, 'b', 'assigned', 'j2', 'released:10 priority:0'),
  ev(10, 'b', 'moving', 'j2', 'depart:10 arrive:50'),
  ev(50, 'b', 'loading', 'j2', 'until:70', 'p'),
  ev(70, 'b', 'completed', 'j2', 'failed:ROUTE_EXHAUSTED', 'p'),
  ev(200, 'b', 'assigned', 'j3', 'released:150 priority:1'),
  ev(200, 'b', 'moving', 'j3', 'depart:200 arrive:260'),
  ev(260, 'b', 'loading', 'j3', 'until:280', 'p'),
  ev(260, 'b', 'moving', 'j3', 'depart:280 arrive:9000'),
].map((e, sequence) => ({ ...e, sequence }));

describe('computeMetrics', () => {
  it('derives completed and failed counts, waits and throughput on the actual horizon from events only', () => {
    const horizon = 400;
    const m = computeMetrics(events, horizon, 'completed', ['a', 'b', 'c']);
    expect(m.completedJobs).toBe(1);
    expect(m.failedJobs).toBe(1);
    expect(m.horizonTicks).toBe(400);
    expect(m.throughputPerHour).toBeCloseTo(1 / ((400 * TICK_MS) / 3_600_000), 9);
    // Wait: assigned at 0, first loading at 100.
    expect(m.meanWaitTicks).toBe(100);
    expect(m.p95WaitTicks).toBe(100);
    expect(m.partial).toBe(false);
  });
  it('computes utilization per robot from moving and loading windows clipped to the horizon', () => {
    const m = computeMetrics(events, 400, 'completed', ['a', 'b', 'c']);
    // a: moving 0-100, loading 100-120, moving 120-300, loading 300-320 = 320 / 400.
    expect(m.utilization['a']).toBeCloseTo(0.8, 9);
    // b: 10-50, 50-70, 200-260, 260-280, 280-400 (clipped from 9000) = 260 / 400.
    expect(m.utilization['b']).toBeCloseTo(0.65, 9);
    expect(m.utilization['c']).toBe(0);
  });
  it('flags every non-completed termination as partial so it cannot pose as a full-horizon score', () => {
    for (const termination of ['budget', 'deadlock', 'cancelled', 'invalid'] as const) expect(computeMetrics(events, 400, termination, ['a']).partial).toBe(true);
    const empty = computeMetrics([], 0, 'invalid', []);
    expect(empty).toMatchObject({ partial: true, completedJobs: 0, throughputPerHour: 0, meanWaitTicks: null, p95WaitTicks: null, utilization: {} });
  });
  it('uses nearest-rank p95 over completed jobs only', () => {
    const many: SimEvent[] = [];
    for (let i = 0; i < 20; i++) {
      const id = `j${i}`;
      many.push(ev(0, 'r', 'assigned', id, 'released:0'), ev(i + 1, 'r', 'loading', id, `until:${i + 2}`, 'p'), ev(i + 2, 'r', 'completed', id, 'completed'));
    }
    many.push(ev(0, 'r', 'assigned', 'never', 'released:0'), ev(500, 'r', 'loading', 'never', 'until:510', 'p'));
    const m = computeMetrics(many, 600, 'budget', ['r']);
    expect(m.completedJobs).toBe(20);
    expect(m.meanWaitTicks).toBeCloseTo(10.5, 9);
    expect(m.p95WaitTicks).toBe(19);
  });
});
