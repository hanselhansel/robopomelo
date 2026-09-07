import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, realpath, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AgentReply, DiscoveryRequest } from '@robopomelo/spec';
import { ProjectService } from '../../packages/application/src/services/project.js';
import { AgentGrantStore } from '../../packages/application/src/agent-grants.js';
import { AgentService, type ConnectionSource } from '../../packages/application/src/agent/service.js';
import type { ProviderAdapter } from '@robopomelo/providers';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const question = { id: 'q-owner', subjectIds: ['challenge:problem-owner'], prompt: 'Who owns the receiving problem?', choices: [{ id: 'lead', label: 'Receiving lead' }], why: 'Approval depends on it.' };
async function fixture(reply: (request: DiscoveryRequest) => Promise<AgentReply>) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'rp-agent-service-')));
  cleanup.push(() => rm(base, { recursive: true, force: true }));
  const project = new ProjectService({ toolVersion: 'test', configDirectory: join(base, 'settings') });
  cleanup.push(() => project.close());
  await project.create(join(base, 'project'), 'Receiving');
  const selected = project.current!;
  const binding = { ...selected.root.identity(), projectId: selected.projectId! };
  const grants = new AgentGrantStore(project.settings);
  const granted = await grants.confirmPreset(binding, 'recommended', await grants.issueNativeConfirmation(binding, 'recommended'));
  selected.writeGrant = granted.trustGrant;
  const connections: ConnectionSource = {
    list: async () => [{ connectionId: 'conn-1', route: 'openrouter', label: 'Work OpenRouter', generation: 1 }],
    secret: async () => { throw new Error('secret must not be read by tests'); },
  };
  const calls: DiscoveryRequest[] = [];
  let started!: () => void;
  const dispatched = new Promise<void>(resolve => { started = resolve; });
  const adapter: ProviderAdapter = {
    models: async () => [{ connectionId: 'conn-1', route: 'openrouter', modelId: 'model-a', label: 'Model A', efforts: ['low', 'high'], inputKinds: ['text'], structuredActions: true, cancellation: true }],
    propose: async (request) => { calls.push(request); started(); return reply(request); },
  };
  const agent = new AgentService(project, connections, { adapters: { openrouter: () => adapter } });
  cleanup.push(() => agent.close());
  return { base, project, agent, binding, grants, granted, calls, dispatched };
}
it('refuses dispatch without a selected named connection and without an active AI grant', async () => {
  const f = await fixture(async () => ({ summary: 's', question: null, proposedActions: [], citedSourceIds: [] }));
  await expect(f.agent.turn()).rejects.toMatchObject({ code: 'CONNECTION_REQUIRED' });
  await f.agent.select({ connectionId: 'conn-1', modelId: 'model-a', effort: 'high' });
  await expect(f.agent.select({ connectionId: 'conn-9', modelId: 'model-a', effort: null })).rejects.toMatchObject({ code: 'CONNECTION_UNKNOWN' });
  await expect(f.agent.select({ connectionId: 'conn-1', modelId: 'model-a', effort: 'ultra' })).rejects.toMatchObject({ code: 'PROVIDER_CAPABILITY' });
  await f.project.revoke();
  await expect(f.agent.turn()).rejects.toMatchObject({ code: 'GRANT_REVOKED' });
  expect(f.calls).toEqual([]);
});
it('runs a turn that persists the question durably and stores agent actions only as a reviewable proposal', async () => {
  const f = await fixture(async () => ({
    summary: 'Recorded the stated problem.',
    question,
    proposedActions: [{ op: 'project', fields: { problem: { state: 'provided', value: 'Inbound pallets wait at the dock.' } } }],
    citedSourceIds: [],
  }));
  await f.agent.select({ connectionId: 'conn-1', modelId: 'model-a', effort: 'low' });
  const before = await f.project.snapshot();
  const result = await f.agent.turn();
  expect(result.kind).toBe('question');
  expect(f.calls[0]).toMatchObject({ connectionId: 'conn-1', modelId: 'model-a', effort: 'low', sourceRevision: before.sourceRevision });
  const state = await f.agent.state();
  expect(state.conversation.active?.question.id).toBe('q-owner');
  expect(state.proposals).toHaveLength(1);
  expect(state.proposals[0]).toMatchObject({ actor: { kind: 'agent' } });
  const after = await f.project.snapshot();
  expect(after.sourceRevision).toBe(before.sourceRevision);
  expect(after.deployment.project.problem).toEqual(before.deployment.project.problem);
  const files = await readdir(join(f.base, 'project', 'conversations', 'main', 'events'));
  expect(files).toEqual(['00000001.json']);
  const events = f.agent.events(state.run!.runId, 0);
  expect(events.map(e => e.kind)).toEqual(['progress', 'question', 'proposed', 'stopped']);
  expect(f.agent.events(state.run!.runId, 2).map(e => e.sequence)).toEqual([3, 4]);
});
it('answers correlate to the exact active question and a foreign or stale button is refused', async () => {
  const f = await fixture(async () => ({ summary: 's', question, proposedActions: [], citedSourceIds: [] }));
  await f.agent.select({ connectionId: 'conn-1', modelId: 'model-a', effort: null });
  await f.agent.turn();
  const snapshot = await f.project.snapshot();
  const base = { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash };
  await expect(f.agent.message({ ...base, questionId: 'q-old', choiceId: 'lead', text: '', attachmentIds: [] })).rejects.toMatchObject({ code: 'QUESTION_MISMATCH' });
  await expect(f.agent.message({ ...base, questionId: 'q-owner', choiceId: 'nope', text: '', attachmentIds: [] })).rejects.toMatchObject({ code: 'CHOICE_UNKNOWN' });
  const answered = await f.agent.message({ ...base, questionId: 'q-owner', choiceId: 'lead', text: '', attachmentIds: [] }, { dispatch: false });
  expect(answered.conversation.active).toBeNull();
  expect(answered.conversation.subjects['challenge:problem-owner']).toMatchObject({ status: 'resolved' });
  const reopened = new AgentService(f.project, { list: async () => [], secret: async () => '' }, { adapters: {} });
  cleanup.push(() => reopened.close());
  expect((await reopened.state()).conversation.history.map(e => e.kind)).toEqual(['agent', 'user']);
});
it('cancels an in-flight turn by generation and ignores the late reply', async () => {
  let release!: () => void;
  const f = await fixture(() => new Promise(resolve => { release = () => resolve({ summary: 'late', question, proposedActions: [], citedSourceIds: [] }); }));
  await f.agent.select({ connectionId: 'conn-1', modelId: 'model-a', effort: null });
  const pending = f.agent.turn();
  await f.dispatched;
  const run = (await f.agent.state()).run!;
  expect(f.agent.cancel(run.runId, run.generation + 5)).toBe(false);
  expect(f.agent.cancel(run.runId, run.generation)).toBe(true);
  release();
  expect((await pending).kind).toBe('cancelled');
  expect((await f.agent.state()).conversation.history).toEqual([]);
});
