/** Provider, discovery and run contracts. See docs/superpowers/plans/agentic-desktop/contracts.md. */
export type SourceBase = { sourceRevision: string; sourceHash: string };
export type RunKey = { runId: string; generation: number };
export type ProviderRoute = 'openrouter' | 'codex' | 'grok';
export type ConnectionModel = {
  connectionId: string;
  route: ProviderRoute;
  modelId: string;
  label: string;
  efforts: string[];
  inputKinds: ('text' | 'image')[];
  structuredActions: boolean;
  cancellation: boolean;
};
export type QuestionChoice = { id: string; label: string };
export type Question = {
  id: string;
  subjectIds: string[];
  prompt: string;
  choices: QuestionChoice[];
  why: string;
};
/** `proposedActions` stays untrusted until a closed union schema decodes it. */
export type AgentReply = {
  summary: string;
  question: Question | null;
  proposedActions: unknown[];
  citedSourceIds: string[];
};
export type DiscoveryRequest = SourceBase &
  RunKey & {
    connectionId: string;
    modelId: string;
    effort: string | null;
    context: string;
    maxOutputTokens: number;
  };
export type AgentEventKind = 'progress' | 'question' | 'proposed' | 'error' | 'stopped';
export type AgentEvent = RunKey & { sequence: number; kind: AgentEventKind; text: string };
export type ExplorationBudget = {
  modelTurns: number;
  maxOutputTokens: number;
  simulationWallMs: number;
  variants: number;
  workers: number;
};
export const DEFAULT_EXPLORATION_BUDGET: Readonly<ExplorationBudget> = Object.freeze({
  modelTurns: 4,
  maxOutputTokens: 4096,
  simulationWallMs: 60_000,
  variants: 3,
  workers: 2,
});
/** A user answer is correlated to the exact question it answers and the source it was read against. */
export type QuestionAnswer = SourceBase & {
  questionId: string;
  choiceId: string | null;
  text: string;
  attachmentIds: string[];
};
export type RunState = 'idle' | 'reserved' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
