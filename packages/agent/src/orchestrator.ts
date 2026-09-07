import type { AgentEvent, AgentReply, DiscoveryRequest, ExplorationBudget, ProjectSnapshot } from '@robopomelo/spec';
import { applyConversationEvent, type ConversationEvent, type ConversationState } from './conversation.js';
import { buildContext, type SourceExcerpt } from './context.js';
import { validateQuestion } from './question.js';
import { initialRun, reduceRun, type RunSnapshot } from './reducer.js';
export interface ProviderAdapterLike {
  propose(request: DiscoveryRequest, signal: AbortSignal): Promise<AgentReply>;
}
export interface DiscoveryDeps {
  adapter: ProviderAdapterLike;
  connection: { connectionId: string; modelId: string; effort: string | null };
  snapshot(): Promise<Pick<ProjectSnapshot, 'deployment' | 'sourceRevision' | 'sourceHash'>>;
  excerpts(): Promise<SourceExcerpt[]>;
  /** Durable append. Must reject rather than partially persist. */
  append(event: ConversationEvent): Promise<void>;
  emit(event: AgentEvent): void;
  /** Turn decoded provider actions into a reviewable draft. Returns whether one
   * was recorded. Runs after the question is durable and before the turn stops. */
  draft?(input: { reply: AgentReply; runId: string; generation: number; base: { sourceRevision: string; sourceHash: string } }): Promise<boolean>;
  clock(): string;
  id(): string;
}
export type TurnResult =
  | { kind: 'question' | 'summary'; conversation: ConversationState; reply: AgentReply }
  | { kind: 'cancelled' | 'paused'; conversation: ConversationState }
  | { kind: 'error'; code: string; message: string; conversation: ConversationState };
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
/** One bounded model turn. Provider output cannot choose its actor, grant,
 * root, destination, idempotency key or source base: those come from here. */
export class DiscoveryOrchestrator {
  run: RunSnapshot;
  #sequence = 0;
  #controller: AbortController | null = null;
  constructor(private readonly deps: DiscoveryDeps, budget: ExplorationBudget) {
    this.run = initialRun(deps.id(), budget);
  }
  #emit(kind: AgentEvent['kind'], text: string): void {
    this.deps.emit({ runId: this.run.runId, generation: this.run.generation, sequence: ++this.#sequence, kind, text });
  }
  /** Increments generation synchronously and aborts the in-flight request. */
  cancel(): void {
    if (TERMINAL.has(this.run.state)) return;
    this.run = reduceRun(this.run, { type: 'cancel' });
    this.#controller?.abort();
  }
  extend(budget: Partial<ExplorationBudget>): void {
    this.run = reduceRun(this.run, { type: 'extend', budget });
  }
  async turn(conversation: ConversationState): Promise<TurnResult> {
    if (TERMINAL.has(this.run.state)) {
      // A resumed run is a new explicit run on the current source; budget carries over.
      this.run = { ...initialRun(this.deps.id(), this.run.budget), remaining: { ...this.run.remaining } };
      this.#sequence = 0;
    }
    this.run = reduceRun(this.run, { type: 'reserve' });
    if (this.run.state === 'paused') return { kind: 'paused', conversation };
    const generation = this.run.generation;
    const controller = new AbortController();
    this.#controller = controller;
    const cancelled = () => this.run.generation !== generation || controller.signal.aborted;
    this.#emit('progress', 'Preparing bounded project context.');
    let request: DiscoveryRequest, subjects, sourceIds: string[];
    try {
      const [snapshot, excerpts] = await Promise.all([this.deps.snapshot(), this.deps.excerpts()]);
      const context = buildContext({ snapshot, conversation, excerpts });
      subjects = context.subjects; sourceIds = context.sourceIds;
      request = {
        sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash,
        runId: this.run.runId, generation,
        connectionId: this.deps.connection.connectionId, modelId: this.deps.connection.modelId, effort: this.deps.connection.effort,
        context: context.text, maxOutputTokens: this.run.budget.maxOutputTokens,
      };
    } catch (error) {
      this.run = reduceRun(this.run, { type: 'release' });
      return this.#error(conversation, 'CONTEXT_FAILED', error);
    }
    if (cancelled()) {
      if (!TERMINAL.has(this.run.state)) this.run = reduceRun(this.run, { type: 'release' });
      return this.#stopped(conversation);
    }
    this.run = reduceRun(this.run, { type: 'dispatched' });
    let reply: AgentReply;
    try {
      reply = await this.deps.adapter.propose(request, controller.signal);
    } catch (error) {
      if (cancelled()) return this.#stopped(conversation);
      this.run = reduceRun(this.run, { type: 'settled' });
      return this.#error(conversation, (error as { code?: string }).code ?? 'PROVIDER_FAILED', error);
    } finally {
      if (this.#controller === controller) this.#controller = null;
    }
    if (cancelled()) return this.#stopped(conversation);
    this.run = reduceRun(this.run, { type: 'settled' });
    try {
      const question = reply.question === null ? null : validateQuestion(reply.question, subjects);
      const prior = conversation.active?.question.id;
      const event: ConversationEvent = {
        kind: 'agent', sequence: conversation.sequence + 1, at: this.deps.clock(), runId: this.run.runId, generation,
        summary: typeof reply.summary === 'string' ? reply.summary.slice(0, 4000) : '', question,
        citedSourceIds: (Array.isArray(reply.citedSourceIds) ? reply.citedSourceIds : []).filter((id) => sourceIds.includes(id)),
        ...(prior !== undefined && (question !== null || conversation.active?.stale) ? { replaces: prior } : {}),
        base: { sourceRevision: request.sourceRevision, sourceHash: request.sourceHash },
      };
      const next = applyConversationEvent(conversation, event);
      await this.deps.append(event);
      this.#emit(question ? 'question' : 'progress', question ? question.prompt : event.summary);
      if (Array.isArray(reply.proposedActions) && reply.proposedActions.length && this.deps.draft) {
        try {
          if (await this.deps.draft({ reply, runId: this.run.runId, generation, base: event.base })) this.#emit('proposed', 'Draft proposal recorded for review.');
        } catch (error) {
          this.#emit('error', (error as { code?: string }).code ?? 'PROVIDER_SCHEMA');
        }
      }
      this.#emit('stopped', 'Turn complete.');
      return { kind: question ? 'question' : 'summary', conversation: next, reply };
    } catch (error) {
      return this.#error(conversation, 'PROVIDER_SCHEMA', error);
    }
  }
  #stopped(conversation: ConversationState): TurnResult {
    this.#emit('stopped', 'Cancelled before any change was written.');
    return { kind: 'cancelled', conversation };
  }
  #error(conversation: ConversationState, code: string, error: unknown): TurnResult {
    const message = error instanceof Error ? error.message : String(error);
    this.#emit('error', code);
    this.#emit('stopped', 'Turn ended without changes.');
    return { kind: 'error', code, message, conversation };
  }
}
