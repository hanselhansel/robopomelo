// @vitest-environment jsdom
import { useState } from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { EditorPane } from '../src/EditorPane.js';
import { DraftController } from '../src/lib/draft.js';
import { api } from '../src/lib/api.js';
import type { Screen } from '../src/lib/navigation.js';
import { snapshot, document, traceabilityRows } from './reference.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('parks an incomplete supplied decision while authority settings are open and restores its input', async () => {
  const values: Record<string, unknown> = {
    '/api/project/review': document,
    '/api/project/traceability': traceabilityRows,
    '/api/trust': { root: '/fixture', grant: null, effectiveScopes: ['inspect'], mode: 'autonomous' },
    '/api/updates': { mode: 'off', pin: null, offline: true },
  };
  vi.spyOn(api, 'request').mockImplementation(async <T,>(path: string): Promise<T> => values[path] as T);
  const draft = new DraftController(snapshot, async () => {
    throw new Error('Unexpected mutation');
  });
  function Wrapper() {
    const [active, setActive] = useState<Screen>('review');
    const [parked, setParked] = useState<Screen | null>(null);
    return (
      <EditorPane
        screen={active}
        parked={parked}
        view={draft.view}
        draft={draft}
        revealId={null}
        scopes={[]}
        onView={() => {}}
        onRefresh={async () => {}}
        onResume={() => {}}
        onSettings={() => {
          setParked('review');
          setActive('settings');
        }}
        onReturn={() => {
          setActive('review');
          setParked(null);
        }}
        refreshTrust={async () => {}}
      />
    );
  }
  render(<Wrapper />);
  fireEvent.click(screen.getByRole('button', { name: 'Record operator decision' }));
  fireEvent.change(screen.getByLabelText('Recorded by'), { target: { value: 'Recorder in progress' } });
  fireEvent.change(screen.getByLabelText('Source of supplied decision'), {
    target: { value: 'Partial source note' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open authority settings' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings & updates' })).toBeTruthy());
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Return to unsaved editor' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  expect(screen.getByLabelText('Recorded by')).toHaveProperty('value', 'Recorder in progress');
  expect(screen.getByLabelText('Source of supplied decision')).toHaveProperty('value', 'Partial source note');
});
