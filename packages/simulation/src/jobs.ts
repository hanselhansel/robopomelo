import type { Station, Workload } from '@robopomelo/spec';
import { xorshift32 } from './prng.js';
import { SimulationError, TICK_MS, type Tick } from './types.js';

export type JobSpec = { id: string; releaseTick: Tick; fromStationId: string; toStationId: string; priority: number };
export type JobState = 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';
export const JOB_STATES: readonly JobState[] = ['queued', 'active', 'completed', 'failed', 'cancelled'];
export type LedgerCounts = Record<JobState, number> & { released: number };

/** Seeded job release from a workload.
 *
 * Inter-arrival mapping: the mean gap is `3600 s / arrivalsPerHour` converted to
 * ticks (`meanTicks = 3_600_000 / (TICK_MS * arrivalsPerHour)`). Each gap is an
 * exponential sample `ceil(-ln(1 - u) * meanTicks)` with `u` from xorshift32, so
 * gaps are integer ticks and the release process is Poisson-like. The first job
 * is released after the first gap. Station pairs are drawn from the cumulative mix
 * share with a second draw; a draw that lands beyond the cumulative total (float
 * noise) takes the last row. Workload has no priority field; every generated job
 * has priority 0. Exactly `workload.jobs` jobs are produced. */
export function generateJobs(workload: Workload, stations: readonly Station[]): JobSpec[] {
  if (!Number.isSafeInteger(workload.jobs) || workload.jobs < 0) throw new SimulationError('INVALID_WORKLOAD', `jobs ${workload.jobs} must be a non-negative integer`);
  if (!(workload.arrivalsPerHour > 0) || !Number.isFinite(workload.arrivalsPerHour)) throw new SimulationError('INVALID_WORKLOAD', `arrivalsPerHour ${workload.arrivalsPerHour} must be positive`);
  if (workload.mix.length === 0) throw new SimulationError('INVALID_WORKLOAD', 'mix must not be empty');
  const known = new Set(stations.map((s) => s.id));
  let total = 0;
  for (const row of workload.mix) {
    if (!(row.share > 0) || !Number.isFinite(row.share)) throw new SimulationError('INVALID_WORKLOAD', `mix share ${row.share} must be positive`);
    for (const id of [row.fromStationId, row.toStationId]) if (!known.has(id)) throw new SimulationError('UNKNOWN_STATION', `mix references unknown station ${id}`);
    total += row.share;
  }
  const cumulative: number[] = [];
  let acc = 0;
  for (const row of workload.mix) cumulative.push((acc += row.share));
  let rng: () => number;
  try { rng = xorshift32(workload.seed); } catch { throw new SimulationError('INVALID_SEED', `workload seed ${workload.seed} is not a 32-bit positive integer`); }
  const meanTicks = 3_600_000 / (TICK_MS * workload.arrivalsPerHour);
  const jobs: JobSpec[] = [];
  let tick = 0;
  for (let i = 0; i < workload.jobs; i++) {
    tick += Math.ceil(-Math.log(1 - rng()) * meanTicks);
    const draw = rng() * total;
    let index = cumulative.findIndex((c) => draw < c);
    if (index < 0) index = workload.mix.length - 1;
    const row = workload.mix[index]!;
    jobs.push({ id: `job-${String(i).padStart(4, '0')}`, releaseTick: tick, fromStationId: row.fromStationId, toStationId: row.toStationId, priority: 0 });
  }
  return jobs;
}

const TRANSITIONS: Record<JobState, readonly JobState[]> = {
  queued: ['active', 'failed', 'cancelled'],
  active: ['queued', 'completed', 'failed', 'cancelled'],
  completed: [], failed: [], cancelled: [],
};

/** Exact task accounting. Every released job is in exactly one of the five
 * states; transitions are validated so a job can never vanish or duplicate.
 * `active -> queued` is the reassignment path. */
export class JobLedger {
  private readonly states = new Map<string, JobState>();
  release(id: string): void {
    if (this.states.has(id)) throw new SimulationError('DUPLICATE_JOB', `job ${id} was already released`);
    this.states.set(id, 'queued');
  }
  stateOf(id: string): JobState {
    const s = this.states.get(id);
    if (!s) throw new SimulationError('UNKNOWN_JOB', `job ${id} was never released`);
    return s;
  }
  transition(id: string, to: JobState): void {
    const from = this.stateOf(id);
    if (!TRANSITIONS[from].includes(to)) throw new SimulationError('INVALID_JOB_TRANSITION', `job ${id}: ${from} -> ${to} is not allowed`);
    this.states.set(id, to);
  }
  /** Job ids in a state, in release order. */
  idsIn(state: JobState): string[] {
    const out: string[] = [];
    for (const [id, s] of this.states) if (s === state) out.push(id);
    return out;
  }
  counts(): LedgerCounts {
    const c: LedgerCounts = { queued: 0, active: 0, completed: 0, failed: 0, cancelled: 0, released: this.states.size };
    for (const s of this.states.values()) c[s]++;
    return c;
  }
  /** Moves every non-terminal job to cancelled (run cancellation). */
  cancelOpen(): string[] {
    const moved: string[] = [];
    for (const [id, s] of this.states) if (s === 'queued' || s === 'active') { this.states.set(id, 'cancelled'); moved.push(id); }
    return moved;
  }
}
