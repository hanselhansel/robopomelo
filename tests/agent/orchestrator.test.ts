import { expect, it } from 'vitest';
import { createBlankProject } from '@robopomelo/core';
import type { AgentReply, DiscoveryRequest, ProjectSnapshot } from '@robopomelo/spec';
import { DEFAULT_EXPLORATION_BUDGET } from '@robopomelo/spec';
import { DiscoveryOrchestrator, type DiscoveryDeps } from '../../packages/agent/src/orchestrator.js';
import { emptyConversation } from '../../packages/agent/src/conversation.js';
const deployment = createBlankProject({ id: 'p1', name: 'Blank', revision: 'rev-1', timestamp: '2026-09-07T00:00:00Z' });
const snapshot = { deployment, sourceRevision: 'rev-1', sourceHash: 'd'.repeat(64) } as Pick<ProjectSnapshot, 'deployment' | 'sourceRevision' | 'sourceHash'>;
const reply = (question: AgentReply['question']): AgentReply => ({ summary: 'Understood.', question, proposedActions: [], citedSourceIds: [] });
const goodQuestion = { id: 'q-owner', subjectIds: ['challenge:problem-owner'], prompt: 'Who owns the receiving problem?', choices: [{ id: 'lead', label: 'Receiving lead' }], why: 'Approval depends on it.' };
function harness(propose: (request: DiscoveryRequest, signal: AbortSignal) => Promise<AgentReply>) {
  const appended: unknown[] = [];
  const events: unknown[] = [];
  let now = 0;
  const deps: DiscoveryDeps = {
    adapter: { propose },
    connection: { connectionId: 'conn-1', modelId: 'model-a', effort: null },
    snapshot: async () => snapshot,
    excerpts: async () => [{ sourceId: 'evidence-1', title: 'brief.txt', text: 'Move pallets.' }],
    append: async (event) => { appended.push(event); },
    emit: (event) => { events.push(event); },
    clock: () => new Date(1_700_000_000_000 + now++ * 1000).toISOString(),
    id: (() => { let n = 0; return () => 'id-' + ++n; })(),
  };
  const orchestrator = new DiscoveryOrchestrator(deps, { ...DEFAULT_EXPLORATION_BUDGET, modelTurns: 2 });
  return { orchestrator, appended, events, deps };
}
it('reserves a turn, dispatches bounded context, persists the validated question and emits ordered events', async () => {
  let seen: DiscoveryRequest | undefined;
  const h = harness(async (request) => { seen = request; return reply(goodQuestion); });
  const result = await h.orchestrator.turn(emptyConversation('main'));
  expect(seen).toMatchObject({ connectionId: 'conn-1', modelId: 'model-a', effort: null, sourceRevision: 'rev-1', maxOutputTokens: 4096 });
  expect(seen!.context).toContain('Unresolved subjects');
  expect(seen!.context).toContain('brief.txt');
  expect(result.kind).toBe('question');
  expect(result.conversation.active?.question.id).toBe('q-owner');
  expect(h.appended).toHaveLength(1);
  expect(h.appended[0]).toMatchObject({ kind: 'agent', sequence: 1, runId: expect.any(String), generation: 0, citedSourceIds: [] });
  expect((h.events as { kind: string; sequence: number }[]).map(e => e.kind)).toEqual(['progress', 'question', 'stopped']);
  expect((h.events as { sequence: number }[]).map(e => e.sequence)).toEqual([1, 2, 3]);
  expect(h.orchestrator.run.remaining.modelTurns).toBe(1);
  expect(h.orchestrator.run.state).toBe('idle');
});
it('drops a reply that arrives after cancellation without writing anything', async () => {
  let release!: () => void;
  const h = harness((_request, signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
    release = () => resolve(reply(goodQuestion));
  }));
  const pending = h.orchestrator.turn(emptyConversation('main'));
  await new Promise(resolve => setTimeout(resolve, 0));
  const generation = h.orchestrator.run.generation;
  h.orchestrator.cancel();
  release();
  const result = await pending;
  expect(result.kind).toBe('cancelled');
  expect(h.orchestrator.run.generation).toBe(generation + 1);
  expect(h.appended).toEqual([]);
  expect((h.events as { kind: string }[]).map(e => e.kind)).toEqual(['progress', 'stopped']);
  expect(h.orchestrator.run.remaining.modelTurns).toBe(1);
});
it('rejects an invalid question with a named error, keeps the conversation unchanged and consumes the turn', async () => {
  const h = harness(async () => reply({ ...goodQuestion, subjectIds: ['does-not-exist'] }));
  const conversation = emptyConversation('main');
  const result = await h.orchestrator.turn(conversation);
  expect(result.kind).toBe('error');
  expect(result.kind === 'error' && result.code).toBe('PROVIDER_SCHEMA');
  expect(result.conversation).toEqual(conversation);
  expect(h.appended).toEqual([]);
  expect(h.orchestrator.run.remaining.modelTurns).toBe(1);
  expect(h.orchestrator.run.state).toBe('idle');
});
it('pauses on budget exhaustion before any dispatch and resumes only after the budget is extended', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return reply(null); });
  let conversation = emptyConversation('main');
  conversation = (await h.orchestrator.turn(conversation)).conversation;
  conversation = (await h.orchestrator.turn(conversation)).conversation;
  const exhausted = await h.orchestrator.turn(conversation);
  expect(exhausted.kind).toBe('paused');
  expect(calls).toBe(2);
  expect(h.orchestrator.run.state).toBe('paused');
  h.orchestrator.extend({ modelTurns: 1 });
  expect((await h.orchestrator.turn(conversation)).kind).toBe('summary');
  expect(calls).toBe(3);
});
it('replaces a stale active question explicitly and never lets a provider choose actor, grant or base', async () => {
  const h = harness(async () => reply({ ...goodQuestion, id: 'q-2', subjectIds: ['project.problem'] }));
  let conversation = emptyConversation('main');
  conversation = (await h.orchestrator.turn(conversation)).conversation;
  const first = conversation.active!.question.id;
  conversation = { ...conversation, active: { ...conversation.active!, stale: 'new-input' } };
  const result = await h.orchestrator.turn(conversation);
  expect(result.conversation.active?.question.id).toBe('q-2');
  expect(h.appended[1]).toMatchObject({ kind: 'agent', replaces: first, base: { sourceRevision: 'rev-1' } });
  expect(Object.keys(h.appended[1] as object).sort()).toEqual(['at', 'base', 'citedSourceIds', 'generation', 'kind', 'question', 'replaces', 'runId', 'sequence', 'summary']);
});
