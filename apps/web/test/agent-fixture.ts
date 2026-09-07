import { vi } from 'vitest';
import type { AgentEvent, ConnectionModel, DesktopBridge, Question } from '@robopomelo/spec';
import { DEFAULT_EXPLORATION_BUDGET } from '@robopomelo/spec/browser';
import { api } from '../src/lib/api.js';
import type { ActiveQuestion, AgentState, ConversationState, ModelInventory, RunSnapshot } from '../src/features/agent/types.js';
export const base = { sourceRevision: 'rev-7', sourceHash: 'hash-7' };
export const question: Question = {
  id: 'q1',
  subjectIds: ['pallet-size'],
  prompt: 'Which pallet size does the line receive?',
  choices: [
    { id: 'euro', label: 'EUR pallet' },
    { id: 'us', label: 'US pallet' },
  ],
  why: 'Rack pitch and conveyor width depend on it.',
};
export const active = (stale: ActiveQuestion['stale'] = null, q: Question = question): ActiveQuestion => ({
  question: q,
  runId: 'run-1',
  generation: 2,
  base,
  sequence: 2,
  stale,
});
export const conversation = (activeQuestion: ActiveQuestion | null): ConversationState => ({
  formatVersion: '1.0.0',
  id: 'main',
  sequence: 2,
  active: activeQuestion,
  history: [
    { kind: 'user', sequence: 1, at: '2026-09-07T10:00:00Z', text: 'Plan the inbound dock', attachmentIds: [], answer: null, base },
    {
      kind: 'agent',
      sequence: 2,
      at: '2026-09-07T10:00:05Z',
      runId: 'run-1',
      generation: 2,
      summary: 'Two receiving lanes feed one storage aisle.',
      question: activeQuestion ? activeQuestion.question : null,
      citedSourceIds: ['src-1', 'src-2'],
      base,
    },
  ],
  subjects: {},
});
export const run = (state: RunSnapshot['state'], reason: string | null = null, modelTurns = 3): RunSnapshot => ({
  runId: 'run-1',
  generation: 2,
  state,
  budget: { ...DEFAULT_EXPLORATION_BUDGET },
  remaining: { ...DEFAULT_EXPLORATION_BUDGET, modelTurns },
  reason,
});
export const model = (overrides: Partial<ConnectionModel> & { connectionId: string }): ConnectionModel => ({
  route: 'openrouter',
  modelId: 'gpt-6-astra',
  label: 'GPT-6 Astra',
  efforts: ['medium', 'high'],
  inputKinds: ['text'],
  structuredActions: true,
  cancellation: true,
  ...overrides,
});
export const inventory = (): ModelInventory[] => [
  {
    connection: { connectionId: 'or-1', route: 'openrouter', label: 'OpenRouter', generation: 1 },
    models: [model({ connectionId: 'or-1' }), model({ connectionId: 'or-1', modelId: 'tiny-chat', label: 'Tiny Chat', efforts: [], structuredActions: false })],
    error: null,
  },
  {
    connection: { connectionId: 'codex-1', route: 'codex', label: 'Codex', generation: 4 },
    models: [model({ connectionId: 'codex-1', route: 'codex', efforts: ['low', 'high'] })],
    error: null,
  },
];
export const agentState = (overrides: Partial<AgentState> = {}): AgentState => ({
  conversation: conversation(active()),
  run: null,
  selection: null,
  proposals: [],
  ...overrides,
});
export interface Call { path: string; body: unknown; project: boolean; method: string | undefined }
export interface Server {
  state: () => AgentState | Promise<AgentState>;
  models: () => ModelInventory[] | Promise<ModelInventory[]>;
  events: (after: number) => AgentEvent[];
  message: (body: Record<string, unknown>) => unknown;
  other: (call: Call) => unknown;
  calls: Call[];
}
/** Routes api.request calls to overridable handlers and records every call. */
export function mockServer(overrides: Partial<Omit<Server, 'calls'>> = {}): Server {
  const server: Server = {
    state: () => agentState(),
    models: () => inventory(),
    events: () => [],
    message: () => ({ conversation: conversation(null), turn: { kind: 'summary', conversation: conversation(null) } }),
    other: () => ({}),
    calls: [],
    ...overrides,
  };
  vi.spyOn(api, 'request').mockImplementation(async (path: string, body?: unknown, project = true, method?: string) => {
    const call: Call = { path, body, project, method };
    server.calls.push(call);
    if (path === '/api/agent/state') return server.state();
    if (path === '/api/agent/models') return server.models();
    if (path === '/api/agent/messages') return server.message(body as Record<string, unknown>);
    const events = /^\/api\/agent\/runs\/[^/]+\/events\?after=(\d+)$/.exec(path);
    if (events) return server.events(Number(events[1]));
    return server.other(call);
  });
  return server;
}
export const calls = (server: Server, path: string) => server.calls.filter((call) => call.path === path || call.path.startsWith(path + '?'));
export function bridge(): DesktopBridge {
  return {
    chooseProjectFolder: vi.fn(),
    selectAttachments: vi.fn().mockResolvedValue([{ selectionId: 'att-1', name: 'dock.pdf', bytes: 10 }]),
    dropAttachments: vi.fn().mockResolvedValue([]),
    inspectAttachment: vi.fn(),
    cancelAttachment: vi.fn().mockResolvedValue(undefined),
    confirmSetup: vi.fn().mockResolvedValue(undefined),
    cancelRun: vi.fn().mockResolvedValue(undefined),
    connectProvider: vi.fn().mockResolvedValue({ connectionId: 'or-2', route: 'openrouter', generation: 1, state: 'connected', accountLabel: 'me' }),
    listConnections: vi.fn().mockResolvedValue([]),
    connectionStatus: vi.fn(),
    disconnect: vi.fn().mockResolvedValue({ connectionId: 'or-1', route: 'openrouter', generation: 2, state: 'disconnected', accountLabel: null }),
  };
}
