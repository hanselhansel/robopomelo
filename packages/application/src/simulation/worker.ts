import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { runFleet, type FleetInput, type FleetLimits, type FleetResult } from '@robopomelo/simulation';
import { HttpError } from '../server/security.js';
import type { ResultMessage, RunMessage } from './worker-entry.js';

export type RunJob = { input: FleetInput; limits: Omit<FleetLimits, 'shouldStop'>; wallMs: number };
export type ExecuteControl = {
  /** Aborted by the host on cancel or when the wall deadline passes. */
  signal: AbortSignal;
  /** Host clock deadline (ms on `now()`'s scale) or null; synchronous strategies must check it themselves. */
  deadline: number | null;
  now: () => number;
  onProgress?: ((tick: number) => void) | undefined;
};
export type ExecuteStrategy = (job: RunJob, control: ExecuteControl) => Promise<FleetResult>;
export type RunOutcome = { result: FleetResult; stoppedBy: 'deadline' | 'cancel' | null; wallMs: number };
export type RunnerOptions = { strategy?: ExecuteStrategy; now?: () => number; terminateMs?: number };
const PROGRESS_EVERY = 100;

/** Same-thread execution. Used by tests and as a fallback; the engine still
 * observes the host deadline every tick because it never reads a clock itself. */
export const inlineStrategy: ExecuteStrategy = async (job, control) => {
  let tick = 0;
  return runFleet(job.input, {
    ...job.limits,
    shouldStop: () => {
      if (++tick % PROGRESS_EVERY === 0) control.onProgress?.(tick);
      return control.signal.aborted || (control.deadline !== null && control.now() >= control.deadline);
    },
  });
};

/** Worker-thread execution from an immutable plain-data snapshot. Messages are
 * structured clones of data only. Stop requests travel through a shared Int32
 * flag the engine polls each tick, so a busy worker still stops promptly. The
 * entry is resolved as `./worker-entry.mjs` beside this module; desktop and CLI
 * bundles emit worker-entry as a sibling output. Vitest runs TypeScript through
 * vite-node and cannot spawn that entry, which is why tests inject inlineStrategy. */
/** CommonJS bundles (desktop main) expose __filename; ESM bundles expose import.meta.url. */
const siblingEntry = (): URL => new URL('./worker-entry.mjs', typeof __filename === 'string' ? pathToFileURL(__filename) : import.meta.url);
export const workerStrategy = (entry: URL = siblingEntry()): ExecuteStrategy => (job, control) => new Promise((resolve, reject) => {
  if (entry.protocol === 'file:' && !existsSync(fileURLToPath(entry))) { reject(new HttpError(500, 'WORKER_ENTRY_MISSING', 'The simulation worker entry is not bundled beside the application. Build worker-entry.js next to the runtime bundle.')); return; }
  const shared = new SharedArrayBuffer(8), flags = new Int32Array(shared);
  const worker = new Worker(entry);
  const stop = () => Atomics.store(flags, 0, 1);
  control.signal.addEventListener('abort', stop, { once: true });
  const poll = setInterval(() => control.onProgress?.(Atomics.load(flags, 1)), 250);
  let settled = false;
  const finish = (done: () => void) => { if (settled) return; settled = true; clearInterval(poll); control.signal.removeEventListener('abort', stop); void worker.terminate(); done(); };
  worker.once('message', (message: ResultMessage) => finish(() => (message.kind === 'result' ? resolve(message.result) : reject(new HttpError(500, message.code || 'WORKER_FAILED', message.message)))));
  worker.once('error', (error) => finish(() => reject(error)));
  worker.once('exit', (code) => finish(() => reject(new HttpError(500, 'WORKER_EXITED', `The simulation worker exited with code ${code} before answering.`))));
  worker.postMessage({ kind: 'run', input: job.input, limits: job.limits, shared } satisfies RunMessage);
});

/** Runs one job under a host-owned wall deadline and cancellation. The host
 * gives a stopped strategy `terminateMs` (2 s) to hand back its partial result
 * before treating it as unresponsive. */
export class SimulationRunner {
  readonly strategy: ExecuteStrategy;
  readonly now: () => number;
  readonly terminateMs: number;
  #controller: AbortController | null = null;
  #cause: 'deadline' | 'cancel' | null = null;
  progressTick = 0;
  constructor(options: RunnerOptions = {}) {
    this.strategy = options.strategy ?? workerStrategy();
    this.now = options.now ?? (() => performance.now());
    this.terminateMs = options.terminateMs ?? 2000;
  }
  get stopRequested(): 'deadline' | 'cancel' | null { return this.#cause; }
  cancel(): void { this.#stop('cancel'); }
  #stop(cause: 'deadline' | 'cancel'): void {
    if (!this.#controller || this.#controller.signal.aborted) return;
    this.#cause = cause;
    this.#controller.abort(cause);
  }
  async run(job: RunJob, onProgress?: (tick: number) => void): Promise<RunOutcome> {
    if (this.#controller) throw new HttpError(409, 'RUN_ACTIVE', 'This runner already has an active run.');
    if (!Number.isSafeInteger(job.wallMs) || job.wallMs <= 0) throw new HttpError(400, 'INVALID_INPUT', 'Supply a positive wall-clock limit.');
    const controller = (this.#controller = new AbortController());
    const started = this.now(), deadline = started + job.wallMs;
    const deadlineTimer = setTimeout(() => this.#stop('deadline'), job.wallMs);
    let terminateTimer: ReturnType<typeof setTimeout> | undefined;
    const unresponsive = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => { terminateTimer = setTimeout(() => reject(new HttpError(500, 'WORKER_UNRESPONSIVE', 'The simulation did not stop within the termination window.')), this.terminateMs); }, { once: true });
    });
    try {
      const result = await Promise.race([
        this.strategy(job, { signal: controller.signal, deadline, now: this.now, onProgress: (tick) => { this.progressTick = tick; onProgress?.(tick); } }),
        unresponsive,
      ]);
      const stoppedBy = result.termination === 'cancelled' ? (this.#cause ?? 'deadline') : null;
      return { result, stoppedBy, wallMs: this.now() - started };
    } finally {
      clearTimeout(deadlineTimer);
      if (terminateTimer) clearTimeout(terminateTimer);
      this.#controller = null;
    }
  }
}
