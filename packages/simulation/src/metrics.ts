import type { FleetMetrics, SimEvent, Termination } from './fleet-types.js';
import { TICK_MS, type Tick } from './types.js';

// packages/simulation/src/metrics.ts: required invariant utility
export function assertTaskConservation(released: number, counts: number[]): void {
  if (!Number.isSafeInteger(released) || released < 0 ||
      counts.some(n => !Number.isSafeInteger(n) || n < 0) ||
      counts.reduce((a,b) => a+b,0) !== released) throw new Error('TASK_ACCOUNTING');
}

const field = (reason: string, key: string): number | null => {
  const m = new RegExp(`(?:^|\\s)${key}:(\\d+)(?:\\s|$)`).exec(reason);
  return m ? Number(m[1]) : null;
};

/** Nearest-rank percentile of a non-empty sorted array. */
const percentile = (sorted: readonly number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;

/** Metrics derived only from the event stream and the ACTUAL simulated horizon.
 * - completedJobs: `completed` events with reason `completed`; failedJobs: reason `failed:*`.
 * - throughputPerHour: completed jobs per simulated hour of `horizonTicks`.
 * - wait ticks per completed job: from its `assigned` event to its first `loading` event.
 * - utilization per robot: fraction of the horizon spent moving (`depart`/`arrive`
 *   fields of `moving` events) or in service (`loading` .. `until`), clipped to the horizon.
 * - partial: true unless the run terminated `completed`; a partial run never claims a
 *   full-horizon score. */
export function computeMetrics(events: readonly SimEvent[], horizonTicks: Tick, termination: Termination, robotIds: readonly string[]): FleetMetrics {
  let completedJobs = 0, failedJobs = 0;
  const assigned = new Map<string, Tick>(), firstLoading = new Map<string, Tick>(), completedIds: string[] = [];
  const busy = new Map<string, [Tick, Tick][]>(robotIds.map((id) => [id, []]));
  const clip = (robotId: string, start: Tick, end: Tick): void => {
    const s = Math.max(0, start), e = Math.min(horizonTicks, end);
    if (e > s) busy.get(robotId)?.push([s, e]);
  };
  for (const e of events) {
    if (e.kind === 'completed') {
      if (e.reason === 'completed') { completedJobs++; if (e.taskId) completedIds.push(e.taskId); } else if (e.reason.startsWith('failed:')) failedJobs++;
    } else if (e.kind === 'assigned' && e.taskId) assigned.set(e.taskId, e.tick);
    else if (e.kind === 'loading') {
      if (e.taskId && !firstLoading.has(e.taskId)) firstLoading.set(e.taskId, e.tick);
      const until = field(e.reason, 'until');
      if (until !== null) clip(e.robotId, e.tick, until);
    } else if (e.kind === 'moving') {
      const depart = field(e.reason, 'depart'), arrive = field(e.reason, 'arrive');
      if (depart !== null && arrive !== null) clip(e.robotId, depart, arrive);
    }
  }
  const waits = completedIds.map((id) => (assigned.has(id) && firstLoading.has(id) ? firstLoading.get(id)! - assigned.get(id)! : null)).filter((w): w is number => w !== null).sort((a, b) => a - b);
  const hours = (horizonTicks * TICK_MS) / 3_600_000;
  const utilization: Record<string, number> = {};
  for (const [robotId, intervals] of busy) {
    intervals.sort((a, b) => a[0] - b[0]);
    let total = 0, cursor = 0;
    for (const [s, e] of intervals) { const start = Math.max(s, cursor); if (e > start) { total += e - start; cursor = e; } }
    utilization[robotId] = horizonTicks > 0 ? total / horizonTicks : 0;
  }
  return {
    partial: termination !== 'completed', horizonTicks, completedJobs, failedJobs,
    throughputPerHour: hours > 0 ? completedJobs / hours : 0,
    meanWaitTicks: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
    p95WaitTicks: waits.length ? percentile(waits, 95) : null,
    utilization,
  };
}
