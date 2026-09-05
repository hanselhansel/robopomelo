// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { ExternalSourceNotice, canRefreshSource } from '../src/components/ExternalSourceNotice.js';
import { api } from '../src/lib/api.js';
import type { DraftView } from '../src/lib/draft.js';
const view = {
  committed: { sourceHash: 'base' },
  dirty: false,
  state: 'Saved',
  proposalId: null,
} as DraftView;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('allows one polling request, skips hidden tabs and cancels stale project responses', async () => {
  vi.useFakeTimers();
  let resolve!: (value: unknown) => void;
  const request = vi.spyOn(api, 'request').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const mounted = render(<ExternalSourceNotice view={view} onRefresh={vi.fn()} onCompare={vi.fn()} />);
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(request).toHaveBeenCalledTimes(1);
  const signal = request.mock.calls[0]![4]!;
  mounted.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolve({ sourceHash: 'changed' });
  });
  expect(screen.queryByRole('status')).toBeNull();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  render(<ExternalSourceNotice view={view} onRefresh={vi.fn()} onCompare={vi.fn()} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(request).toHaveBeenCalledTimes(1);
});
it('does not refresh automatically and routes proposed input to conflict comparison', async () => {
  vi.spyOn(api, 'request').mockResolvedValue({ sourceHash: 'changed' });
  const refresh = vi.fn(),
    compare = vi.fn();
  render(
    <ExternalSourceNotice
      view={{ ...view, state: 'Proposed', proposalId: 'p1' }}
      onRefresh={refresh}
      onCompare={compare}
    />,
  );
  expect((await screen.findByRole('status')).textContent).toContain('Your current input is retained.');
  expect(screen.queryByRole('button', { name: 'Recheck source' })).toBeNull();
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Compare external source' }));
  expect(compare).toHaveBeenCalledOnce();
});
it('blocks refresh for every pending state including unknown outcomes', () => {
  expect(canRefreshSource(view)).toBe(true);
  for (const state of [
    'Editing',
    'Saving',
    'Proposed',
    'Save failed',
    'Changes conflict',
    'Outcome unknown',
  ] as const)
    expect(canRefreshSource({ ...view, state })).toBe(false);
  expect(canRefreshSource({ ...view, dirty: true })).toBe(false);
});
it('ignores an old poll after the committed base changes', async () => {
  let resolve!: (value: unknown) => void;
  vi.spyOn(api, 'request').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const mounted = render(<ExternalSourceNotice view={view} onRefresh={vi.fn()} onCompare={vi.fn()} />);
  mounted.rerender(
    <ExternalSourceNotice
      view={{ ...view, committed: { ...view.committed, sourceHash: 'own-save' } }}
      onRefresh={vi.fn()}
      onCompare={vi.fn()}
    />,
  );
  await act(async () => {
    resolve({ sourceHash: 'base' });
  });
  expect(screen.queryByRole('status')).toBeNull();
});
