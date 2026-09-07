import { randomUUID } from 'node:crypto';
import type { AgentEvent, ConnectionModel, ExplorationBudget, PatchEnvelope, QuestionAnswer, Scope } from '@robopomelo/spec';
import { DEFAULT_EXPLORATION_BUDGET } from '@robopomelo/spec';
import {
  DiscoveryOrchestrator, applyConversationEvent, checkAnswer, emptyConversation,
  type ConversationEvent, type ConversationState, type RunSnapshot, type TurnResult,
} from '@robopomelo/agent';
import { ConversationStore, ProjectFsError } from '@robopomelo/project-fs';
import { ProviderError } from '@robopomelo/providers';
import type { ProjectService, SelectedProject } from '../services/project.js';
import type { ProviderAdapter } from '@robopomelo/providers';
import { AgentGrantStore } from '../agent-grants.js';
import { HttpError } from '../server/security.js';
import { ProviderBroker, type BrokerOptions, type ConnectionSource, type ConnectionSummary } from './broker.js';
import { decodeProposedActions } from './actions.js';
import { loadConversation, planningExcerpts, projectProposals, type ProposalSummary } from './project-io.js';
export type { ConnectionSource, ConnectionSummary } from './broker.js';
export interface Selection { connectionId: string; modelId: string; effort: string | null; generation: number; label: string }
export interface AgentState {
  conversation: ConversationState;
  run: RunSnapshot | null;
  selection: Omit<Selection, 'generation'> | null;
  proposals: ProposalSummary[];
}
interface TurnAuthority { binding: { canonicalPath: string; device: string; fileId: string; projectId: string }; review: { grantId: string; generation: number; scopes: Scope[] } }
interface ProjectAgent {
  epoch: string;
  conversation: ConversationState;
  store: ConversationStore;
  orchestrator: DiscoveryOrchestrator | null;
  /** Resolved per turn so a changed selection or authority never reuses stale values. */
  current: { adapter: ProviderAdapter; selection: Selection; authority: TurnAuthority } | null;
  events: AgentEvent[];
  busy: Promise<unknown> | null;
}
const EVENT_BUFFER = 500;
/** Per-project discovery loop. Enforces, before every dispatch: an active
 * paired AI grant for the exact root/project, a named connection at its
 * current generation, an unchanged project epoch, and review-each-change
 * authority for anything the model drafts. */
export class AgentService {
  readonly broker: ProviderBroker;
  readonly grants: AgentGrantStore;
  #agents = new Map<string, ProjectAgent>();
  #selection: Selection | null = null;
  constructor(private readonly project: ProjectService, connections: ConnectionSource, options: BrokerOptions = {}, private readonly budget: ExplorationBudget = DEFAULT_EXPLORATION_BUDGET) {
    this.broker = new ProviderBroker(connections, options);
    this.grants = new AgentGrantStore(project.settings);
  }
  async #agent(): Promise<{ agent: ProjectAgent; selected: SelectedProject }> {
    return this.project.withProject(async (selected) => {
      const epoch = this.project.epoch;
      let agent = this.#agents.get(epoch);
      if (!agent) {
        for (const [key, stale] of this.#agents) { stale.orchestrator?.cancel(); this.#agents.delete(key); }
        const store = new ConversationStore(selected.root, 'main');
        agent = { epoch, conversation: await loadConversation(store), store, orchestrator: null, current: null, events: [], busy: null };
        this.#agents.set(epoch, agent);
      }
      return { agent, selected };
    });
  }
  async state(): Promise<AgentState> {
    const { agent, selected } = await this.#agent();
    return {
      conversation: agent.conversation,
      run: agent.orchestrator?.run ?? null,
      selection: this.#selection ? { connectionId: this.#selection.connectionId, modelId: this.#selection.modelId, effort: this.#selection.effort, label: this.#selection.label } : null,
      proposals: await projectProposals(this.project, selected),
    };
  }
  async models(): Promise<{ connection: ConnectionSummary; models: ConnectionModel[]; error: string | null }[]> {
    const connections = await this.broker.connections();
    return Promise.all(connections.map(async (connection) => {
      try {
        const { adapter } = await this.broker.adapter(connection.connectionId);
        return { connection, models: await adapter.models(AbortSignal.timeout(20_000)), error: null };
      } catch (error) {
        return { connection, models: [], error: error instanceof ProviderError ? error.code : 'PROVIDER_NETWORK' };
      }
    }));
  }
  async select(input: { connectionId: string; modelId: string; effort: string | null }): Promise<AgentState['selection']> {
    const connection = (await this.broker.connections()).find((item) => item.connectionId === input.connectionId);
    if (!connection) throw new HttpError(404, 'CONNECTION_UNKNOWN', 'Connect this account before selecting its models.');
    const { adapter } = await this.broker.adapter(connection.connectionId);
    const model = (await adapter.models(AbortSignal.timeout(20_000))).find((item) => item.modelId === input.modelId);
    if (!model) throw new HttpError(404, 'MODEL_UNKNOWN', 'That model is not offered by the selected connection.');
    if (input.effort !== null && !model.efforts.includes(input.effort))
      throw new HttpError(409, 'PROVIDER_CAPABILITY', 'The selected model does not support that effort on this route.');
    if (!model.structuredActions)
      throw new HttpError(409, 'PROVIDER_CAPABILITY', 'The selected model cannot return structured planning actions on this route.');
    this.#selection = { ...input, generation: connection.generation, label: `${model.label} via ${connection.label}` };
    return { connectionId: input.connectionId, modelId: input.modelId, effort: input.effort, label: this.#selection.label };
  }
  events(runId: string, after: number): AgentEvent[] {
    for (const agent of this.#agents.values()) if (agent.orchestrator?.run.runId === runId || agent.events.some((event) => event.runId === runId))
      return agent.events.filter((event) => event.runId === runId && event.sequence > after);
    return [];
  }
  cancel(runId: string, generation: number): boolean {
    for (const agent of this.#agents.values()) {
      const run = agent.orchestrator?.run;
      if (run && run.runId === runId) {
        if (run.generation !== generation) return false;
        agent.orchestrator!.cancel();
        return true;
      }
    }
    return false;
  }
  extend(budget: Partial<ExplorationBudget>): void {
    for (const agent of this.#agents.values()) agent.orchestrator?.extend(budget);
  }
  async #exclusive<T>(agent: ProjectAgent, work: () => Promise<T>): Promise<T> {
    if (agent.busy) throw new HttpError(409, 'AGENT_BUSY', 'A discovery turn is already running. Cancel it or wait for it to finish.');
    const promise = work();
    agent.busy = promise;
    try { return await promise; } finally { if (agent.busy === promise) agent.busy = null; }
  }
  async #append(agent: ProjectAgent, event: ConversationEvent): Promise<ConversationState> {
    const next = applyConversationEvent(agent.conversation, event);
    await agent.store.append(event);
    agent.conversation = next;
    if (next.sequence % 50 === 0) await agent.store.checkpoint(next.sequence, next);
    return next;
  }
  async message(answer: QuestionAnswer, options: { dispatch?: boolean } = {}): Promise<{ conversation: ConversationState; turn: TurnResult | null }> {
    const { agent } = await this.#agent();
    return this.#exclusive(agent, async () => {
      const active = agent.conversation.active;
      const answering = answer.choiceId !== null || (active !== null && answer.questionId === active.question.id);
      if (answering) {
        const check = checkAnswer(active, answer);
        if (!check.ok) throw new HttpError(409, check.code, 'That answer no longer matches the active question. Read the current question and answer it again.');
      } else if (!answer.text.trim() && !answer.attachmentIds.length) throw new HttpError(400, 'ANSWER_EMPTY', 'Write an answer or attach a file.');
      const event: ConversationEvent = {
        kind: 'user', sequence: agent.conversation.sequence + 1, at: this.project.clock(), text: answer.text.slice(0, 16_000),
        attachmentIds: [...answer.attachmentIds].slice(0, 20), answer: answering ? { questionId: answer.questionId, choiceId: answer.choiceId } : null,
        base: { sourceRevision: answer.sourceRevision, sourceHash: answer.sourceHash },
      };
      await this.#append(agent, event);
      const turn = options.dispatch === false ? null : await this.#turn(agent);
      return { conversation: agent.conversation, turn };
    });
  }
  async turn(): Promise<TurnResult> {
    const { agent } = await this.#agent();
    return this.#exclusive(agent, () => this.#turn(agent));
  }
  async #turn(agent: ProjectAgent): Promise<TurnResult> {
    const selection = this.#selection;
    if (!selection) throw new HttpError(409, 'CONNECTION_REQUIRED', 'Choose a connected model before asking the agent.');
    const { connection, adapter } = await this.broker.adapter(selection.connectionId);
    if (connection.generation !== selection.generation) throw new HttpError(409, 'CONNECTION_CHANGED', 'The connection changed. Select the model again.');
    const authority = await this.project.withProject(async (selected): Promise<TurnAuthority> => {
      if (!selected.projectId || !selected.writeGrant) throw new ProjectFsError('GRANT_REVOKED', 'Project authority is required before the agent may draft.');
      const binding = { ...selected.root.identity(), projectId: selected.projectId };
      const aiGrant = await this.grants.lookup(binding);
      if (!aiGrant) throw new ProjectFsError('GRANT_REVOKED', 'Connected AI is not permitted for this project.');
      await this.grants.check(binding, { grantId: aiGrant.grantId, generation: aiGrant.generation }, ['use-connected-ai']);
      await this.project.trust.withAuthorization(binding, selected.writeGrant, ['author'], async () => {});
      return { binding, review: this.project.trust.authorizeRun(binding, ['inspect', 'author'], 'review-each-change') };
    }, agent.epoch);
    agent.current = { adapter, selection, authority };
    agent.orchestrator ??= this.#orchestrator(agent);
    return agent.orchestrator.turn(agent.conversation);
  }
  #orchestrator(agent: ProjectAgent): DiscoveryOrchestrator {
    const current = () => {
      if (!agent.current) throw new HttpError(409, 'CONNECTION_REQUIRED', 'Choose a connected model before asking the agent.');
      return agent.current;
    };
    return new DiscoveryOrchestrator({
      adapter: { propose: (request, signal) => current().adapter.propose(request, signal) },
      connection: {
        get connectionId() { return current().selection.connectionId; },
        get modelId() { return current().selection.modelId; },
        get effort() { return current().selection.effort; },
      },
      snapshot: () => this.project.snapshot(),
      excerpts: () => this.project.withProject((selected) => planningExcerpts(selected), agent.epoch),
      append: async (event) => { await this.#append(agent, event); },
      emit: (event) => { agent.events.push(event); if (agent.events.length > EVENT_BUFFER) agent.events.splice(0, agent.events.length - EVENT_BUFFER); },
      draft: (input) => this.#draft(agent, input),
      clock: this.project.clock,
      id: randomUUID,
    }, this.budget);
  }
  /** Agent output becomes a stored proposal under review-each-change authority; it never commits. */
  async #draft(agent: ProjectAgent, input: { reply: { proposedActions: unknown[]; summary: string }; runId: string; base: { sourceRevision: string; sourceHash: string } }): Promise<boolean> {
    const { selection, authority } = agent.current!;
    const operations = decodeProposedActions(input.reply.proposedActions);
    const patch: PatchEnvelope = {
      formatVersion: '1.0.0', id: `agent-${input.runId}-${agent.conversation.sequence}`, projectId: authority.binding.projectId,
      baseRevision: input.base.sourceRevision, baseHash: input.base.sourceHash,
      actor: { kind: 'agent', name: selection.label }, purpose: input.reply.summary.slice(0, 500) || 'Agent draft', operations,
    };
    return this.project.withProject(async (selected) => {
      const drafted = await this.project.requireSession(selected).commit({
        expected: { sourceRevision: patch.baseRevision, sourceHash: patch.baseHash }, idempotencyKey: patch.id,
        authorization: authority.review, actor: patch.actor, mutation: { kind: 'patch', patch },
      });
      if (drafted.kind === 'committed') throw new ProjectFsError('SCOPE_DENIED', 'Agent drafts must remain proposals until a human approves them.');
      return drafted.kind === 'proposal';
    }, agent.epoch);
  }
  async close(): Promise<void> {
    for (const agent of this.#agents.values()) agent.orchestrator?.cancel();
    this.#agents.clear();
  }
}
