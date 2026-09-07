import type { ExplorationBudget } from '@robopomelo/spec';
import { BudgetLedger, type BudgetSnapshot, type Reservation } from './budget.js';
/** Bounded proactive exploration: up to `variants` proposals from the one
 * eligible connection, each simulated locally with at most `workers`
 * concurrent simulations. Every request reserves budget first and nothing
 * launches after a limit is exhausted; deeper exploration needs `extend`. */
export type Variant = { id: string; connectionId: string; label: string; params: Record<string, number> };
export type ProposeContext = { runId: string; generation: number; index: number; connectionId: string; maxOutputTokens: number; prior: ExperimentRecord[] };
export type ProposeResult = { variant: Variant; usage: { outputTokens: number } | null };
export type SimulateResult = { status: 'completed' | 'partial'; result: unknown; wallMs: number };
export interface ExplorationDeps {
  runId: string;
  /** The exact connection this run may use; a variant naming another one is refused. */
  connectionId: string;
  propose(context: ProposeContext, signal: AbortSignal): Promise<ProposeResult>;
  simulate(variant: Variant, signal: AbortSignal): Promise<SimulateResult>;
}
export type StopReason = 'COMPLETED' | 'BUDGET_REACHED' | 'CANCELLED' | 'TOOL_TIMEOUT' | 'RATE_LIMITED' | 'FALLBACK_DENIED';
export type ExperimentStatus = 'planned' | 'proposing' | 'simulating' | 'completed' | 'partial' | 'failed';
export type PlannedExperiment = { index: number; reserved: { modelTurns: number; maxOutputTokens: number; simulationWallMs: number } };
export interface ExperimentRecord {
  index: number;
  variant: Variant | null;
  status: ExperimentStatus;
  result: unknown;
  stopReason: StopReason | null;
  error: string | null;
}
export type ExplorationStop = { reason: StopReason; detail: string };
export interface ExplorationSummary { runId: string; generation: number; planned: PlannedExperiment[]; experiments: ExperimentRecord[]; stop: ExplorationStop; ledger: BudgetSnapshot }
export interface ExplorationView extends ExplorationSummary { active: boolean; stop: ExplorationStop }
const code = (error: unknown): string => {
  const e = error as { code?: unknown; status?: unknown; name?: string };
  if (typeof e?.code === 'string') return e.code;
  if (e?.status === 429) return 'RATE_LIMITED';
  if (e?.name === 'AbortError') return 'CANCELLED';
  return error instanceof Error ? error.message : String(error);
};
export class ExplorationRun {
  readonly #ledger: BudgetLedger;
  readonly #experiments: ExperimentRecord[] = [];
  #planned: PlannedExperiment[];
  #generation = 0;
  #active = false;
  #controller: AbortController | null = null;
  #stop: ExplorationStop = { reason: 'COMPLETED', detail: 'Not started.' };
  constructor(private readonly deps: ExplorationDeps, budget: ExplorationBudget) {
    this.#ledger = new BudgetLedger(budget);
    this.#planned = this.#plan(budget);
  }
  #plan(limits: ExplorationBudget): PlannedExperiment[] {
    const perSimulation = limits.variants > 0 ? Math.floor(limits.simulationWallMs / limits.variants) : 0;
    return Array.from({ length: limits.variants }, (_, index) => ({ index, reserved: { modelTurns: 1, maxOutputTokens: limits.maxOutputTokens, simulationWallMs: perSimulation } }));
  }
  snapshot(): ExplorationView {
    return { runId: this.deps.runId, generation: this.#generation, active: this.#active, planned: this.#planned.map((p) => ({ ...p, reserved: { ...p.reserved } })), experiments: this.#experiments.map((e) => ({ ...e })), stop: { ...this.#stop }, ledger: this.#ledger.snapshot() };
  }
  /** Synchronously bumps the generation and aborts every in-flight signal. */
  cancel(): void {
    this.#generation += 1;
    this.#controller?.abort();
  }
  /** The only way to go deeper: every new limit must exceed the displayed one. */
  extend(limits: Partial<ExplorationBudget>): void {
    if (this.#active) throw new Error('EXPLORATION_ACTIVE');
    this.#ledger.extend(limits);
    this.#planned = this.#plan(this.#ledger.snapshot().limits);
  }
  async start(): Promise<ExplorationSummary> {
    if (this.#active) throw new Error('EXPLORATION_ACTIVE');
    this.#active = true;
    const generation = this.#generation, controller = new AbortController();
    this.#controller = controller;
    const cancelled = () => this.#generation !== generation;
    const simulations: Promise<void>[] = [];
    try {
      this.#stop = { reason: 'COMPLETED', detail: 'Every planned experiment finished.' };
      while (this.#experiments.length < this.#planned.length) {
        if (cancelled()) { this.#stop = { reason: 'CANCELLED', detail: 'Cancelled before the next request.' }; break; }
        const record: ExperimentRecord = { index: this.#experiments.length, variant: null, status: 'planned', result: null, stopReason: null, error: null };
        const slot = this.#reserveVariant(record);
        if (!slot) break;
        this.#experiments.push(record);
        const variant = await this.#propose(record, generation, controller.signal, slot);
        if (slot.state === 'reserved') this.#ledger.release(slot);
        else if (slot.state === 'sent') this.#ledger.settle(slot, null);
        if (!variant) { if (record.status === 'planned') this.#experiments.pop(); break; }
        if (simulations.length >= this.#ledger.snapshot().limits.workers) await Promise.race(simulations);
        const job = this.#simulate(record, variant, controller.signal).finally(() => { simulations.splice(simulations.indexOf(job), 1); });
        simulations.push(job);
      }
      await Promise.all(simulations);
      if (cancelled() && this.#stop.reason === 'COMPLETED') this.#stop = { reason: 'CANCELLED', detail: 'Cancelled while simulations were finishing.' };
    } finally {
      if (this.#controller === controller) this.#controller = null;
      this.#active = false;
    }
    return this.#summary(generation);
  }
  #summary(generation: number): ExplorationSummary {
    const view = this.snapshot();
    return { runId: view.runId, generation, planned: view.planned, experiments: view.experiments, stop: view.stop, ledger: view.ledger };
  }
  #reserveVariant(record: ExperimentRecord): Reservation | null {
    try { return this.#ledger.reserve('variants'); }
    catch { this.#stop = { reason: 'BUDGET_REACHED', detail: `variants exhausted before experiment ${record.index + 1}.` }; return null; }
  }
  #reserveTurn(record: ExperimentRecord, after: string): { turn: Reservation; tokens: Reservation } | null {
    const bound = this.#planned[record.index]?.reserved.maxOutputTokens ?? 0;
    let turn: Reservation | null = null;
    try {
      turn = this.#ledger.reserve('modelTurns');
      const tokens = this.#ledger.reserve('maxOutputTokens', Math.min(bound, Math.max(1, this.#ledger.remaining('maxOutputTokens'))));
      return { turn, tokens };
    } catch {
      if (turn) this.#ledger.release(turn);
      const dimension = turn ? 'maxOutputTokens' : 'modelTurns';
      // Nothing was sent for this experiment: the record stays 'planned' and the caller drops it.
      this.#stop = { reason: 'BUDGET_REACHED', detail: `${dimension} exhausted${after ? ` after ${after}` : ''} before experiment ${record.index + 1}.` };
      return null;
    }
  }
  async #propose(record: ExperimentRecord, generation: number, signal: AbortSignal, slot: Reservation): Promise<Variant | null> {
    let after = '';
    for (;;) {
      if (this.#generation !== generation) { this.#fail(record, 'CANCELLED', 'Cancelled before the request was sent.'); this.#stop = { reason: 'CANCELLED', detail: 'Cancelled between variants.' }; return null; }
      const reserved = this.#reserveTurn(record, after);
      if (!reserved) return null;
      const { turn, tokens } = reserved;
      this.#ledger.markSent(turn); this.#ledger.markSent(tokens);
      if (slot.state === 'reserved') this.#ledger.markSent(slot);
      record.status = 'proposing';
      const context: ProposeContext = { runId: this.deps.runId, generation, index: record.index, connectionId: this.deps.connectionId, maxOutputTokens: tokens.amount, prior: this.#experiments.filter((e) => e !== record).map((e) => ({ ...e })) };
      let result: ProposeResult;
      try {
        result = await this.deps.propose(context, signal);
      } catch (error) {
        const reason = this.#generation !== generation ? 'CANCELLED' : code(error);
        // A rate-limited request still costs its turn but produced no output; other failures leave usage unknown.
        this.#ledger.settle(turn, null); this.#ledger.settle(tokens, reason === 'RATE_LIMITED' ? 0 : null);
        if (reason === 'RATE_LIMITED') { after = 'repeated RATE_LIMITED'; record.status = 'failed'; record.stopReason = 'RATE_LIMITED'; record.error = 'Provider rate limited the request.'; continue; }
        this.#fail(record, reason === 'CANCELLED' ? 'CANCELLED' : 'TOOL_TIMEOUT', reason);
        this.#stop = reason === 'CANCELLED' ? { reason: 'CANCELLED', detail: 'Cancelled during a model request.' } : { reason: 'TOOL_TIMEOUT', detail: `Model request failed: ${reason}.` };
        return null;
      }
      this.#ledger.settle(turn, null);
      this.#ledger.settle(tokens, result.usage ? result.usage.outputTokens : null);
      if (this.#generation !== generation) { this.#fail(record, 'CANCELLED', 'Cancelled after the reply arrived.'); this.#stop = { reason: 'CANCELLED', detail: 'Cancelled between variants.' }; return null; }
      const variant = result.variant;
      if (!variant || variant.connectionId !== this.deps.connectionId) {
        this.#fail(record, 'FALLBACK_DENIED', `Variant named connection ${String(variant?.connectionId)}; only ${this.deps.connectionId} is eligible.`);
        this.#stop = { reason: 'FALLBACK_DENIED', detail: record.error! };
        return null;
      }
      record.variant = variant; record.status = 'planned'; record.stopReason = null; record.error = null;
      return variant;
    }
  }
  async #simulate(record: ExperimentRecord, variant: Variant, signal: AbortSignal): Promise<void> {
    const bound = this.#planned[record.index]?.reserved.simulationWallMs ?? 0;
    let worker: Reservation, wall: Reservation | null = null;
    try {
      worker = this.#ledger.reserve('workers');
      if (bound > 0) wall = this.#ledger.reserve('simulationWallMs', Math.min(bound, Math.max(1, this.#ledger.remaining('simulationWallMs'))));
    } catch {
      this.#fail(record, 'BUDGET_REACHED', 'No simulation budget left.');
      this.#stop = { reason: 'BUDGET_REACHED', detail: `simulation budget exhausted before experiment ${record.index + 1}.` };
      return;
    }
    this.#ledger.markSent(worker); if (wall) this.#ledger.markSent(wall);
    record.status = 'simulating';
    try {
      const outcome = await this.deps.simulate(variant, signal);
      this.#ledger.settle(worker, 0); if (wall) this.#ledger.settle(wall, Math.max(0, Math.round(outcome.wallMs)));
      record.status = outcome.status; record.result = outcome.result;
    } catch (error) {
      this.#ledger.settle(worker, 0); if (wall) this.#ledger.settle(wall, null);
      const reason = signal.aborted ? 'CANCELLED' : code(error);
      record.status = reason === 'TOOL_TIMEOUT' ? 'partial' : 'failed';
      record.stopReason = reason === 'CANCELLED' ? 'CANCELLED' : 'TOOL_TIMEOUT';
      record.error = reason;
    }
  }
  #fail(record: ExperimentRecord, reason: StopReason, error: string): void {
    record.status = 'failed'; record.stopReason = reason; record.error = error;
  }
}
