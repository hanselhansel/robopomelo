import { expect, it } from 'vitest';
import { acceptEvent, reserveTurn } from '../../packages/agent/src/state.js';
import { reduceRun, initialRun, type RunSnapshot } from '../../packages/agent/src/reducer.js';
it('rejects cancelled-generation responses and exhausted work', () => {
  expect(acceptEvent({ runId: 'r1', generation: 2 }, {
    runId: 'r1', generation: 1, sequence: 8, kind: 'question', text: 'obsolete',
  }, 7)).toBe(false);
  expect(acceptEvent({ runId: 'r1', generation: 2 }, { runId: 'r1', generation: 2, sequence: 8, kind: 'progress', text: 'ok' }, 7)).toBe(true);
  expect(acceptEvent({ runId: 'r1', generation: 2 }, { runId: 'r1', generation: 2, sequence: 7, kind: 'progress', text: 'replay' }, 7)).toBe(false);
  expect(acceptEvent({ runId: 'r1', generation: 2 }, { runId: 'r2', generation: 2, sequence: 8, kind: 'progress', text: 'other run' }, 7)).toBe(false);
  expect(() => reserveTurn(0)).toThrow('BUDGET_REACHED');
  expect(() => reserveTurn(1.5)).toThrow('BUDGET_REACHED');
  expect(reserveTurn(3)).toBe(2);
});
it('reserves budget before dispatch and increments generation before cancellation', () => {
  let run: RunSnapshot = initialRun('r1', { modelTurns: 2, maxOutputTokens: 4096, simulationWallMs: 60_000, variants: 3, workers: 2 });
  expect(run.state).toBe('idle');
  run = reduceRun(run, { type: 'reserve' });
  expect(run).toMatchObject({ state: 'reserved', remaining: { modelTurns: 1 } });
  run = reduceRun(run, { type: 'dispatched' });
  expect(run.state).toBe('running');
  const before = run.generation;
  run = reduceRun(run, { type: 'cancel' });
  expect(run.state).toBe('cancelled');
  expect(run.generation).toBe(before + 1);
  expect(() => reduceRun(run, { type: 'reserve' })).toThrow('RUN_TERMINAL');
  expect(() => reduceRun(run, { type: 'complete' })).toThrow('RUN_TERMINAL');
});
it('stops reserving when the turn budget is exhausted and pauses instead of failing', () => {
  let run = initialRun('r2', { modelTurns: 1, maxOutputTokens: 100, simulationWallMs: 1, variants: 1, workers: 1 });
  run = reduceRun(reduceRun(reduceRun(run, { type: 'reserve' }), { type: 'dispatched' }), { type: 'settled' });
  expect(run.state).toBe('idle');
  expect(run.remaining.modelTurns).toBe(0);
  run = reduceRun(run, { type: 'reserve' });
  expect(run.state).toBe('paused');
  expect(run.reason).toBe('BUDGET_REACHED');
  expect(reduceRun(run, { type: 'extend', budget: { modelTurns: 2 } })).toMatchObject({ state: 'idle', remaining: { modelTurns: 2 } });
});
it('does not refund a turn when the request was already sent, but does when nothing was dispatched', () => {
  let run = initialRun('r3', { modelTurns: 2, maxOutputTokens: 100, simulationWallMs: 1, variants: 1, workers: 1 });
  run = reduceRun(run, { type: 'reserve' });
  run = reduceRun(run, { type: 'release' });
  expect(run).toMatchObject({ state: 'idle', remaining: { modelTurns: 2 } });
  run = reduceRun(reduceRun(run, { type: 'reserve' }), { type: 'dispatched' });
  run = reduceRun(run, { type: 'fail', reason: 'PROVIDER_NETWORK' });
  expect(run).toMatchObject({ state: 'failed', reason: 'PROVIDER_NETWORK', remaining: { modelTurns: 1 } });
});
