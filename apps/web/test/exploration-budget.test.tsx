// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExplorationBudget, type ExplorationBudgetView } from '../src/features/agent/ExplorationBudget.js';
afterEach(cleanup);
const limits = { modelTurns: 4, maxOutputTokens: 4096, simulationWallMs: 60_000, variants: 3, workers: 2 };
const view = (over: Partial<ExplorationBudgetView> = {}): ExplorationBudgetView => ({
  runId: 'run-1', generation: 0, active: false,
  planned: [0, 1, 2].map((index) => ({ index, reserved: { modelTurns: 1, maxOutputTokens: 4096, simulationWallMs: 20_000 } })),
  experiments: [
    { index: 0, variant: { id: 'v1', connectionId: 'c', label: 'Fleet of 4', params: { fleet: 4 } }, status: 'completed', result: { throughput: 120 }, stopReason: null, error: null },
    { index: 1, variant: { id: 'v2', connectionId: 'c', label: 'Fleet of 6', params: { fleet: 6 } }, status: 'partial', result: null, stopReason: 'TOOL_TIMEOUT', error: 'TOOL_TIMEOUT' },
  ],
  stop: { reason: 'BUDGET_REACHED', detail: 'modelTurns exhausted before experiment 3.' },
  ledger: {
    limits, consumed: { modelTurns: 4, maxOutputTokens: 900, simulationWallMs: 30_000, variants: 2, workers: 0 },
    pending: { modelTurns: 0, maxOutputTokens: 0, simulationWallMs: 0, variants: 0, workers: 0 },
    remaining: { modelTurns: 0, maxOutputTokens: 3196, simulationWallMs: 30_000, variants: 1, workers: 2 }, usageUnknown: false,
  },
  ...over,
});
it('renders planned experiments, completed and partial results, the stop reason and remaining budget per dimension', () => {
  render(<ExplorationBudget view={view()} cost={{ usd: 0.009, state: 'settled' }} onExtend={vi.fn(async () => {})} />);
  expect(screen.getByText('3 experiments planned')).toBeTruthy();
  expect(screen.getByText('Fleet of 4')).toBeTruthy();
  expect(screen.getAllByText('Completed')).toHaveLength(1);
  expect(screen.getByText('Partial')).toBeTruthy();
  expect(screen.getByText(/Stopped: budget reached/)).toBeTruthy();
  expect(screen.getByText('modelTurns exhausted before experiment 3.')).toBeTruthy();
  expect(screen.getByText('0 of 4 model turns left')).toBeTruthy();
  expect(screen.getByText('3196 of 4096 output tokens left')).toBeTruthy();
  expect(screen.getByText('1 of 3 variants left')).toBeTruthy();
  expect(screen.getByText('$0.009000')).toBeTruthy();
});
it('labels in-flight cost as pending and unknown pricing as unknown, never as zero', () => {
  const { rerender } = render(<ExplorationBudget view={view({ active: true })} cost={{ usd: 0.001, state: 'pending' }} onExtend={vi.fn(async () => {})} />);
  expect(screen.getByText('Cost pending')).toBeTruthy();
  rerender(<ExplorationBudget view={view()} cost={{ usd: null, state: 'unknown' }} onExtend={vi.fn(async () => {})} />);
  expect(screen.getByText('Cost unknown')).toBeTruthy();
  expect(screen.queryByText('$0.000000')).toBeNull();
});
it('posts the new limits through the extend form and offers no other path when the budget is exhausted', async () => {
  const onExtend = vi.fn(async () => {});
  render(<ExplorationBudget view={view()} cost={{ usd: null, state: 'unknown' }} onExtend={onExtend} />);
  const buttons = screen.getAllByRole('button');
  expect(buttons.map((b) => b.textContent)).toEqual(['Allow deeper exploration']);
  fireEvent.change(screen.getByLabelText('Model turns'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('Variants'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Allow deeper exploration' }));
  expect(onExtend).toHaveBeenCalledTimes(1);
  expect(onExtend).toHaveBeenCalledWith({ ...limits, modelTurns: 6, variants: 4 });
});
it('keeps the extend button disabled while nothing exceeds the displayed limits or a run is active', () => {
  const onExtend = vi.fn(async () => {});
  const { rerender } = render(<ExplorationBudget view={view()} cost={{ usd: null, state: 'unknown' }} onExtend={onExtend} />);
  const button = screen.getByRole('button', { name: 'Allow deeper exploration' });
  expect(button).toHaveProperty('disabled', true);
  fireEvent.change(screen.getByLabelText('Model turns'), { target: { value: '4' } });
  expect(button).toHaveProperty('disabled', true);
  fireEvent.change(screen.getByLabelText('Model turns'), { target: { value: '5' } });
  expect(button).toHaveProperty('disabled', false);
  rerender(<ExplorationBudget view={view({ active: true })} cost={{ usd: null, state: 'unknown' }} onExtend={onExtend} />);
  expect(screen.getByRole('button', { name: 'Allow deeper exploration' })).toHaveProperty('disabled', true);
});
