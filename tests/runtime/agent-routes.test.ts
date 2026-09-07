import { afterEach, expect, it } from 'vitest';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AgentReply } from '@robopomelo/spec';
import { startServer } from '../../packages/application/src/server/start.js';
import { ProjectService } from '../../packages/application/src/services/project.js';
import { AgentGrantStore } from '../../packages/application/src/agent-grants.js';
import { AgentService } from '../../packages/application/src/agent/service.js';
import { agentRoutes } from '../../packages/application/src/agent/routes.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const question = { id: 'q-owner', subjectIds: ['challenge:problem-owner'], prompt: 'Who owns it?', choices: [{ id: 'lead', label: 'Lead' }], why: 'w' };
async function host() {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'rp-agent-routes-')));
  cleanup.push(() => rm(temp, { recursive: true, force: true }));
  const project = new ProjectService({ toolVersion: 'test', configDirectory: join(temp, 'config') });
  await project.create(join(temp, 'project'), 'Routes');
  const selected = project.current!;
  const binding = { ...selected.root.identity(), projectId: selected.projectId! };
  const grants = new AgentGrantStore(project.settings);
  selected.writeGrant = (await grants.confirmPreset(binding, 'recommended', await grants.issueNativeConfirmation(binding, 'recommended'))).trustGrant;
  const replies: AgentReply[] = [{ summary: 'ok', question, proposedActions: [], citedSourceIds: [] }];
  const agent = new AgentService(project, { list: async () => [{ connectionId: 'conn-1', route: 'openrouter', label: 'Work', generation: 1 }], secret: async () => 'never' }, { adapters: { openrouter: () => ({
    models: async () => [{ connectionId: 'conn-1', route: 'openrouter', modelId: 'm', label: 'M', efforts: [], inputKinds: ['text'], structuredActions: true, cancellation: true }],
    propose: async () => replies.shift() ?? { summary: 'done', question: null, proposedActions: [], citedSourceIds: [] },
  }) } });
  cleanup.push(() => agent.close());
  const server = await startServer({ toolVersion: 'test', routes: agentRoutes(agent), onClose: () => project.close() });
  cleanup.push(() => server.close());
  server.setProjectStatus(project.status());
  const boot = await fetch(server.url + '/api/session', { method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: new URL(server.bootstrapUrl).hash.slice(1) }) });
  const session = (await boot.json()).data as { credential: string; csrf: string; projectEpoch: string };
  const call = async (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', epoch = session.projectEpoch) => {
    const response = await fetch(server.url + path, { method, headers: { Authorization: `Bearer ${session.credential}`, 'X-RP-Project-Epoch': epoch, 'X-RP-CSRF': session.csrf, Origin: server.url, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: (await response.json()) as { ok: boolean; data?: unknown; error?: { code: string } } };
  };
  const snapshot = await project.snapshot();
  return { call, project, base: { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash }, session };
}
it('accepts free text with an empty question id, rejects malformed bodies and stale epochs, and exposes events by run', async () => {
  const h = await host();
  expect((await h.call('/api/agent/selection', { connectionId: 'conn-1', modelId: 'm', effort: null }, 'PUT')).body.data).toMatchObject({ label: 'M via Work' });
  expect((await h.call('/api/agent/selection', { connectionId: 'conn-1', modelId: 'm', effort: null, extra: 1 }, 'PUT')).body.error?.code).toBe('INVALID_INPUT');
  const sent = await h.call('/api/agent/messages', { ...h.base, questionId: '', choiceId: null, text: 'We move pallets.', attachmentIds: [] });
  expect(sent.status).toBe(200);
  expect((sent.body.data as { turn: { kind: string } }).turn.kind).toBe('question');
  expect((await h.call('/api/agent/messages', { ...h.base, questionId: 'bad id!', choiceId: null, text: 'x', attachmentIds: [] })).body.error?.code).toBe('INVALID_INPUT');
  expect((await h.call('/api/agent/messages', { ...h.base, questionId: '', choiceId: null, text: 'x', attachmentIds: [], secret: 'no' })).body.error?.code).toBe('INVALID_INPUT');
  expect((await h.call('/api/agent/messages', { ...h.base, questionId: '', choiceId: null, text: '', attachmentIds: [] })).body.error?.code).toBe('ANSWER_EMPTY');
  expect((await h.call('/api/agent/state', undefined, 'GET', 'stale')).body.error?.code).toBe('PROJECT_CHANGED');
  const state = (await h.call('/api/agent/state')).body.data as { run: { runId: string; generation: number }; conversation: { active: { question: { id: string } } } };
  expect(state.conversation.active.question.id).toBe('q-owner');
  const events = (await h.call(`/api/agent/runs/${state.run.runId}/events?after=0`)).body.data as { kind: string }[];
  expect(events.map(e => e.kind)).toEqual(['progress', 'question', 'stopped']);
  expect((await h.call(`/api/agent/runs/${state.run.runId}/cancel`, { generation: state.run.generation + 1 })).body.error?.code).toBe('RUN_CHANGED');
  expect((await h.call('/api/agent/messages', { ...h.base, questionId: 'q-owner', choiceId: 'wrong', text: '', attachmentIds: [] })).body.error?.code).toBe('CHOICE_UNKNOWN');
  const answered = await h.call('/api/agent/messages', { ...h.base, questionId: 'q-owner', choiceId: 'lead', text: '', attachmentIds: [], dispatch: false });
  expect((answered.body.data as { conversation: { active: unknown } }).conversation.active).toBeNull();
  expect((await h.call('/api/agent/budget', { modelTurns: 0 })).body.error?.code).toBe('INVALID_INPUT');
  expect(JSON.stringify((await h.call('/api/agent/models')).body)).not.toContain('never');
});
