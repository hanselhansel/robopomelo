// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConversationPanel } from '../src/features/agent/ConversationPanel.js';
import { ApiError } from '../src/lib/api.js';
import { active, agentState, base, bridge, calls, conversation, mockServer, question, run } from './agent-fixture.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const mount = (pollMs = 20) => render(<ConversationPanel bridge={bridge()} base={base} pollMs={pollMs} />);
const message = (server: ReturnType<typeof mockServer>) => calls(server, '/api/agent/messages');
it('shows history with agent summaries and cited source counts', async () => {
  mockServer();
  mount();
  await screen.findByText('Plan the inbound dock');
  expect(screen.getByText('Two receiving lanes feed one storage aisle.')).toBeTruthy();
  expect(screen.getByText('2 sources cited')).toBeTruthy();
});
it('answers a choice against the current active question with the source base', async () => {
  const server = mockServer();
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'EUR pallet' }));
  await waitFor(() => expect(message(server)).toHaveLength(1));
  expect(message(server)[0]!.body).toEqual({
    sourceRevision: 'rev-7',
    sourceHash: 'hash-7',
    questionId: 'q1',
    choiceId: 'euro',
    text: '',
    attachmentIds: [],
  });
  expect(message(server)[0]!.project).toBe(true);
});
it('submits a typed answer with the active question id and refreshes state afterwards', async () => {
  const server = mockServer();
  mount();
  const field = await screen.findByLabelText('Type your answer');
  fireEvent.change(field, { target: { value: 'Custom 1200 x 1000 boards' } });
  fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
  await waitFor(() => expect(message(server)).toHaveLength(1));
  expect(message(server)[0]!.body).toMatchObject({ questionId: 'q1', choiceId: null, text: 'Custom 1200 x 1000 boards' });
  await waitFor(() => expect(calls(server, '/api/agent/state').length).toBeGreaterThanOrEqual(2));
});
it('disables the choices of a stale question and explains why while keeping the composer open', async () => {
  mockServer({ state: () => agentState({ conversation: conversation(active('new-input')) }) });
  mount();
  const choice = await screen.findByRole('button', { name: 'EUR pallet' });
  expect(choice).toHaveProperty('disabled', true);
  expect(screen.getByText('Superseded by new input')).toBeTruthy();
  expect(screen.getByLabelText('Ask anything about your plan')).toHaveProperty('disabled', false);
});
it('renders an old question in history as inert text, never as live buttons', async () => {
  const newer = { ...question, id: 'q2', prompt: 'How many dock doors?', choices: [{ id: 'two', label: 'Two doors' }] };
  const state = agentState({ conversation: conversation(active(null, newer)) });
  state.conversation.history.push({ kind: 'agent', sequence: 3, at: '2026-09-07T10:01:00Z', runId: 'run-1', generation: 2, summary: 'Moving on.', question: newer, citedSourceIds: [], base, replaces: 'q1' });
  state.conversation.history[1] = { ...state.conversation.history[1]!, question } as never;
  mockServer({ state: () => state });
  mount();
  await screen.findByRole('button', { name: 'Two doors' });
  expect(screen.queryByRole('button', { name: 'EUR pallet' })).toBeNull();
  expect(screen.getByText('EUR pallet')).toBeTruthy();
});
it('sends free text without answering and clears the composer only after success', async () => {
  const server = mockServer();
  mount();
  const composer = await screen.findByLabelText('Ask anything about your plan');
  fireEvent.change(composer, { target: { value: 'Add a second inbound lane' } });
  fireEvent.keyDown(composer, { key: 'Enter' });
  await waitFor(() => expect(message(server)).toHaveLength(1));
  expect(message(server)[0]!.body).toMatchObject({ questionId: '', choiceId: null, text: 'Add a second inbound lane', attachmentIds: [], sourceRevision: 'rev-7', sourceHash: 'hash-7' });
  await waitFor(() => expect(composer).toHaveProperty('value', ''));
});
it('keeps a newline on Shift+Enter instead of sending', async () => {
  const server = mockServer();
  mount();
  const composer = await screen.findByLabelText('Ask anything about your plan');
  fireEvent.change(composer, { target: { value: 'line one' } });
  fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(message(server)).toHaveLength(0);
  expect(composer).toHaveProperty('value', 'line one');
});
it.each(['QUESTION_STALE', 'PROVIDER_RATE_LIMIT'])('retains composer text and shows the %s error', async (code) => {
  const server = mockServer({
    message: () => {
      throw new ApiError(code, `Server said ${code}.`, undefined, 409);
    },
  });
  mount();
  const composer = await screen.findByLabelText('Ask anything about your plan');
  fireEvent.change(composer, { target: { value: 'Keep me' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByRole('alert');
  expect(screen.getByText(`Server said ${code}.`)).toBeTruthy();
  expect(composer).toHaveProperty('value', 'Keep me');
  expect(message(server)).toHaveLength(1);
});
it('attaches files through the bridge and sends their selection ids', async () => {
  const server = mockServer();
  const native = bridge();
  render(<ConversationPanel bridge={native} base={base} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Attach files' }));
  await screen.findByText('dock.pdf');
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(message(server)).toHaveLength(1));
  expect(message(server)[0]!.body).toMatchObject({ text: '', attachmentIds: ['att-1'] });
});
it('cancels the current run with its exact generation', async () => {
  const server = mockServer({ state: () => agentState({ run: run('running') }) });
  mount(10_000);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel turn' }));
  await waitFor(() => expect(calls(server, '/api/agent/runs/run-1/cancel')).toHaveLength(1));
  expect(calls(server, '/api/agent/runs/run-1/cancel')[0]!.body).toEqual({ generation: 2 });
  await screen.findByText('Turn cancelled');
});
it('offers four more turns when the budget pauses the run', async () => {
  const server = mockServer({ state: () => agentState({ run: run('paused', 'BUDGET_REACHED', 0) }) });
  server.other = (call) => (call.path === '/api/agent/budget' ? agentState({ run: run('idle', null, 4) }) : {});
  mount();
  expect(await screen.findByText('Budget reached')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Allow 4 more turns' }));
  await waitFor(() => expect(calls(server, '/api/agent/budget')).toHaveLength(1));
  expect(calls(server, '/api/agent/budget')[0]!.body).toEqual({ modelTurns: 4 });
  await screen.findByText('4 of 4 model turns left');
});
it('announces settled outcomes only, not each progress event', async () => {
  const server = mockServer({
    state: () => agentState({ run: run('running') }),
    events: (after) => (after < 1 ? [{ runId: 'run-1', generation: 2, sequence: 1, kind: 'progress', text: 'Reading context' }] : []),
  });
  mount();
  await screen.findByText('Reading context');
  expect(screen.getByRole('status', { name: 'Agent status' }).textContent).toBe('');
  server.message = () => ({ conversation: conversation(active()), turn: { kind: 'question', conversation: conversation(active()) } });
  server.state = () => agentState({ run: run('idle') });
  const composer = screen.getByLabelText('Ask anything about your plan');
  fireEvent.change(composer, { target: { value: 'go' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(screen.getByRole('status', { name: 'Agent status' }).textContent).toBe('Question ready'));
});
it('polls run events while running and stops after the stopped event', async () => {
  let served = 0;
  const server = mockServer({
    state: () => agentState({ run: run('running') }),
    events: (after) => {
      served += 1;
      if (after < 1) return [{ runId: 'run-1', generation: 2, sequence: 1, kind: 'progress', text: 'Asking the model' }];
      server.state = () => agentState({ run: run('idle') });
      if (after < 2) return [{ runId: 'run-1', generation: 2, sequence: 2, kind: 'stopped', text: 'Turn ended without changes.' }];
      return [];
    },
  });
  mount();
  await screen.findByText('Asking the model');
  await screen.findByText('Turn ended without changes.');
  await new Promise((resolve) => setTimeout(resolve, 80));
  const settled = served;
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(served).toBe(settled);
  expect(calls(server, '/api/agent/runs/run-1/events')[0]!.project).toBe(true);
});
