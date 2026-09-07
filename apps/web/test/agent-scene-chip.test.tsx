// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConversationPanel } from '../src/features/agent/ConversationPanel.js';
import { publishSelection } from '../src/features/scene/SelectionContext.js';
import { api } from '../src/lib/api.js';
afterEach(() => { cleanup(); vi.restoreAllMocks(); publishSelection(null); });
const base = { sourceRevision: 'rev-1', sourceHash: 'a'.repeat(64) };
it('binds the selected scene object to the sent message by stable id and lets the user clear it', async () => {
  const posted: unknown[] = [];
  vi.spyOn(api, 'request').mockImplementation(async (path, body) => {
    if (path === '/api/agent/state') return { conversation: { formatVersion: '1.0.0', id: 'main', sequence: 0, active: null, history: [], subjects: {} }, run: null, selection: { connectionId: 'c', modelId: 'm', effort: null, label: 'M via C' }, proposals: [] };
    if (path === '/api/agent/models') return [];
    if (path === '/api/agent/messages') { posted.push(body); return { conversation: { formatVersion: '1.0.0', id: 'main', sequence: 1, active: null, history: [], subjects: {} }, turn: null }; }
    throw new Error('Unexpected ' + path);
  });
  render(<ConversationPanel base={base} />);
  await screen.findByLabelText('Ask anything about your plan');
  publishSelection({ id: 'rack-1', name: 'Rack row R-01' });
  await screen.findByText('Rack row R-01');
  fireEvent.change(screen.getByLabelText('Ask anything about your plan'), { target: { value: 'Move this to widen the aisle.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toMatchObject({ text: expect.stringContaining('rack-1') });
  expect((posted[0] as { text: string }).text).toContain('Move this to widen the aisle.');
  fireEvent.click(screen.getByRole('button', { name: 'Clear selected object Rack row R-01' }));
  await waitFor(() => expect(screen.queryByText('Rack row R-01')).toBeNull());
});
