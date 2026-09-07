import { parentPort } from 'node:worker_threads';
import { runFleet, type FleetInput, type FleetLimits } from '@robopomelo/simulation';
/** Worker body for `workerStrategy` in worker.ts. Receives one plain-data run
 * message and answers with the FleetResult. The host owns wall-clock time: it
 * flips `flags[0]` in the shared buffer and the engine's per-tick `shouldStop`
 * observes it; `flags[1]` publishes the current tick for progress/checkpoints.
 * The desktop and CLI bundles must emit this file next to the application
 * bundle as `worker-entry.js` (see the URL resolution in worker.ts). */
export type RunMessage = { kind: 'run'; input: FleetInput; limits: Omit<FleetLimits, 'shouldStop'>; shared: SharedArrayBuffer };
export type ResultMessage = { kind: 'result'; result: ReturnType<typeof runFleet> } | { kind: 'error'; code: string; message: string };
parentPort?.once('message', (message: RunMessage) => {
  if (!message || message.kind !== 'run') { parentPort?.postMessage({ kind: 'error', code: 'WORKER_PROTOCOL', message: 'Expected a run message.' } satisfies ResultMessage); return; }
  const flags = new Int32Array(message.shared);
  let tick = 0;
  try {
    const result = runFleet(message.input, { ...message.limits, shouldStop: () => { Atomics.store(flags, 1, tick++); return Atomics.load(flags, 0) === 1; } });
    parentPort?.postMessage({ kind: 'result', result } satisfies ResultMessage);
  } catch (error) {
    parentPort?.postMessage({ kind: 'error', code: (error as { code?: string }).code ?? 'WORKER_FAILED', message: error instanceof Error ? error.message : String(error) } satisfies ResultMessage);
  }
});
