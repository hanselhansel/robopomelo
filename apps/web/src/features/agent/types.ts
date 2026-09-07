import type { Actor, ConnectionModel, ExplorationBudget, FieldDiff, ProviderRoute, Question, RunState, SourceBase } from '@robopomelo/spec';
/** Local mirrors of the shapes served by /api/agent/*. The web package cannot
 * import @robopomelo/agent or @robopomelo/application, so these are kept in
 * step by hand with packages/agent/src/{conversation,question,reducer}.ts. */
export type StaleReason = 'subject-changed' | 'new-input' | 'replaced' | 'cancelled';
export interface ActiveQuestion {
  question: Question;
  runId: string;
  generation: number;
  base: SourceBase;
  sequence: number;
  stale: StaleReason | null;
}
export type ConversationEvent =
  | { kind: 'user'; sequence: number; at: string; text: string; attachmentIds: string[]; answer: { questionId: string; choiceId: string | null } | null; base: SourceBase }
  | { kind: 'agent'; sequence: number; at: string; runId: string; generation: number; summary: string; question: Question | null; citedSourceIds: string[]; replaces?: string; base: SourceBase }
  | { kind: 'source'; sequence: number; at: string; changedSubjectIds: string[]; base: SourceBase }
  | { kind: 'system'; sequence: number; at: string; code: string; text: string };
export interface ConversationState {
  formatVersion: '1.0.0';
  id: string;
  sequence: number;
  active: ActiveQuestion | null;
  history: ConversationEvent[];
  subjects: Record<string, { status: 'unresolved' | 'resolved' | 'contradicted'; askedAt?: number; resolvedAt?: number }>;
}
export interface RunSnapshot {
  runId: string;
  generation: number;
  state: RunState;
  budget: ExplorationBudget;
  remaining: ExplorationBudget;
  reason: string | null;
}
export interface ProposalSummary {
  proposalId: string;
  actor: Actor;
  purpose: string;
  status: 'pending' | 'applied' | 'retired' | 'superseded';
  patchDigest: string;
  diff: FieldDiff[];
  supersedes: string | null;
}
export interface Selection {
  connectionId: string;
  modelId: string;
  effort: string | null;
  label: string;
}
export interface AgentState {
  conversation: ConversationState;
  run: RunSnapshot | null;
  selection: Selection | null;
  proposals: ProposalSummary[];
}
export interface ConnectionSummary {
  connectionId: string;
  route: ProviderRoute;
  label: string;
  generation: number;
}
export interface ModelInventory {
  connection: ConnectionSummary;
  models: ConnectionModel[];
  error: string | null;
}
export type TurnResult =
  | { kind: 'question' | 'summary'; conversation: ConversationState }
  | { kind: 'cancelled' | 'paused'; conversation: ConversationState }
  | { kind: 'error'; code: string; message: string; conversation: ConversationState };
export interface MessageResult {
  conversation: ConversationState;
  turn: TurnResult | null;
}
