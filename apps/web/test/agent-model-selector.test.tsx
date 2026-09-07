// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConversationPanel } from '../src/features/agent/ConversationPanel.js';
import { agentState, base, bridge, calls, inventory, mockServer } from './agent-fixture.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const open = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Choose a model|via/ }));
  await screen.findByRole('group', { name: 'GPT-6 Astra via OpenRouter' });
};
it('lists duplicate model labels under distinct connections and keeps them distinguishable', async () => {
  mockServer();
  render(<ConversationPanel bridge={bridge()} base={base} />);
  await open();
  expect(screen.getByRole('group', { name: 'GPT-6 Astra via OpenRouter' })).toBeTruthy();
  expect(screen.getByRole('group', { name: 'GPT-6 Astra via Codex' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Use GPT-6 Astra via OpenRouter' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Use GPT-6 Astra via Codex' })).toBeTruthy();
  expect(screen.getAllByText('gpt-6-astra')).toHaveLength(2);
});
it('selects a model with the exact connection, model and effort, then reads back the selection', async () => {
  const server = mockServer();
  server.other = (call) => {
    if (call.path === '/api/agent/selection') {
      server.state = () => agentState({ selection: { connectionId: 'codex-1', modelId: 'gpt-6-astra', effort: 'high', label: 'GPT-6 Astra via Codex' } });
      return { connectionId: 'codex-1', modelId: 'gpt-6-astra', effort: 'high', label: 'GPT-6 Astra via Codex' };
    }
    return {};
  };
  render(<ConversationPanel bridge={bridge()} base={base} />);
  await open();
  const codex = screen.getByRole('group', { name: 'GPT-6 Astra via Codex' });
  fireEvent.click(within(codex).getByRole('radio', { name: 'High' }));
  fireEvent.click(within(codex).getByRole('button', { name: 'Use GPT-6 Astra via Codex' }));
  await waitFor(() => expect(calls(server, '/api/agent/selection')).toHaveLength(1));
  const put = calls(server, '/api/agent/selection')[0]!;
  expect(put.method).toBe('PUT');
  expect(put.body).toEqual({ connectionId: 'codex-1', modelId: 'gpt-6-astra', effort: 'high' });
  await screen.findByRole('button', { name: 'GPT-6 Astra · High · via Codex' });
});
it('offers only the efforts the model supports on that route plus no effort', async () => {
  mockServer();
  render(<ConversationPanel bridge={bridge()} base={base} />);
  await open();
  const codex = screen.getByRole('group', { name: 'GPT-6 Astra via Codex' });
  expect(within(codex).getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual(['low', 'high', '']);
  expect(within(codex).queryByRole('radio', { name: 'Medium' })).toBeNull();
  const openrouter = screen.getByRole('group', { name: 'GPT-6 Astra via OpenRouter' });
  expect(within(openrouter).queryByRole('radio', { name: 'Low' })).toBeNull();
  expect(within(openrouter).getByRole('radio', { name: 'No effort' })).toBeTruthy();
});
it('keeps unsupported models visible but unavailable with the reason', async () => {
  mockServer();
  render(<ConversationPanel bridge={bridge()} base={base} />);
  await open();
  const tiny = screen.getByRole('group', { name: 'Tiny Chat via OpenRouter' });
  const use = within(tiny).getByRole('button', { name: 'Use Tiny Chat via OpenRouter' });
  expect(use).toHaveProperty('disabled', true);
  expect(within(tiny).getByText('Cannot return structured planning actions')).toBeTruthy();
});
it('shows a connection error code, connects OpenRouter through the bridge and refreshes the inventory', async () => {
  const server = mockServer();
  server.models = () => [{ connection: { connectionId: 'grok-1', route: 'grok', label: 'Grok', generation: 1 }, models: [], error: 'PROVIDER_CAPABILITY' }, ...inventory()];
  const native = bridge();
  render(<ConversationPanel bridge={native} base={base} />);
  await open();
  expect(screen.getByText('PROVIDER_CAPABILITY')).toBeTruthy();
  const before = calls(server, '/api/agent/models').length;
  fireEvent.click(screen.getByRole('button', { name: 'Connect OpenRouter' }));
  await waitFor(() => expect(native.connectProvider).toHaveBeenCalledWith('openrouter'));
  await waitFor(() => expect(calls(server, '/api/agent/models').length).toBe(before + 1));
  expect(calls(server, '/api/agent/models').every((call) => call.project === false)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect Codex' }));
  await waitFor(() => expect(native.disconnect).toHaveBeenCalledWith('codex-1'));
});
it('never selects a model on its own when nothing is chosen', async () => {
  const server = mockServer();
  render(<ConversationPanel bridge={bridge()} base={base} />);
  await screen.findByRole('button', { name: 'Choose a model' });
  await waitFor(() => expect(calls(server, '/api/agent/models')).toHaveLength(1));
  expect(calls(server, '/api/agent/selection')).toHaveLength(0);
});
