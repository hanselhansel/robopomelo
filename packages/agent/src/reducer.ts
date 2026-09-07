import type { ExplorationBudget, RunState } from '@robopomelo/spec';
import { reserveTurn } from './state.js';
export interface RunSnapshot {
  runId: string;
  generation: number;
  state: RunState;
  budget: ExplorationBudget;
  remaining: ExplorationBudget;
  reason: string | null;
}
export type RunAction =
  | { type: 'reserve' }
  | { type: 'release' }
  | { type: 'dispatched' }
  | { type: 'settled' }
  | { type: 'complete' }
  | { type: 'cancel' }
  | { type: 'fail'; reason: string }
  | { type: 'extend'; budget: Partial<ExplorationBudget> };
const TERMINAL: ReadonlySet<RunState> = new Set(['completed', 'failed', 'cancelled']);
export function initialRun(runId: string, budget: ExplorationBudget): RunSnapshot {
  return { runId, generation: 0, state: 'idle', budget: { ...budget }, remaining: { ...budget }, reason: null };
}
const expect = (run: RunSnapshot, states: RunState[], action: string) => {
  if (!states.includes(run.state)) throw new Error(`RUN_INVALID_TRANSITION: ${action} from ${run.state}`);
};
/** Closed state machine. Reserve before dispatch; a sent request keeps its
 * consumed turn; cancellation bumps the generation before anything else. */
export function reduceRun(run: RunSnapshot, action: RunAction): RunSnapshot {
  if (TERMINAL.has(run.state) && action.type !== 'extend') throw new Error('RUN_TERMINAL');
  switch (action.type) {
    case 'reserve': {
      expect(run, ['idle'], action.type);
      try {
        return { ...run, state: 'reserved', remaining: { ...run.remaining, modelTurns: reserveTurn(run.remaining.modelTurns) } };
      } catch (error) {
        if (error instanceof Error && error.message === 'BUDGET_REACHED') return { ...run, state: 'paused', reason: 'BUDGET_REACHED' };
        throw error;
      }
    }
    case 'release':
      expect(run, ['reserved'], action.type);
      return { ...run, state: 'idle', remaining: { ...run.remaining, modelTurns: run.remaining.modelTurns + 1 } };
    case 'dispatched':
      expect(run, ['reserved'], action.type);
      return { ...run, state: 'running' };
    case 'settled':
      expect(run, ['running'], action.type);
      return { ...run, state: 'idle' };
    case 'complete':
      expect(run, ['idle', 'running', 'paused'], action.type);
      return { ...run, state: 'completed' };
    case 'cancel':
      return { ...run, generation: run.generation + 1, state: 'cancelled', reason: 'CANCELLED' };
    case 'fail':
      return { ...run, state: 'failed', reason: action.reason };
    case 'extend': {
      if (TERMINAL.has(run.state)) throw new Error('RUN_TERMINAL');
      expect(run, ['paused', 'idle'], action.type);
      const remaining = { ...run.remaining };
      for (const key of Object.keys(action.budget) as (keyof ExplorationBudget)[]) {
        const value = action.budget[key];
        if (!Number.isSafeInteger(value) || value! < 0) throw new Error('BUDGET_INVALID');
        remaining[key] = value!;
      }
      return { ...run, state: 'idle', reason: null, remaining, budget: { ...run.budget, ...action.budget } };
    }
  }
}
