import type { Actor, Id, Knowledge, Quantity, RecordBase } from './common.js';

export interface Stakeholder extends RecordBase {
  role: Knowledge<string>;
  responsibilities: string[];
}
export interface Need extends RecordBase {
  beneficiaryIds: Id[];
  outcome: Knowledge<string>;
  workflowIds: Id[];
  requirementIds: Id[];
  disposition: Knowledge<string>;
}
export interface Problem extends RecordBase {
  affectedStakeholderIds: Id[];
  workflowIds: Id[];
  observation: Knowledge<string>;
}
export interface FlowStep {
  id: Id;
  title: string;
  location: Knowledge<string>;
  handoffToId: Knowledge<Id>;
}
export interface FlowException {
  id: Id;
  trigger: Knowledge<string>;
  response: Knowledge<string>;
  ownerId: Knowledge<Id>;
  testIds: Id[];
}
export interface Workflow extends RecordBase {
  mode: 'current' | 'intended';
  loadSubject: Knowledge<string>;
  origin: Knowledge<string>;
  destination: Knowledge<string>;
  volume: Knowledge<Quantity>;
  steps: FlowStep[];
  exceptions: FlowException[];
  needIds: Id[];
  assumptionIds: Id[];
}
export interface OpenIssue extends RecordBase {
  statement: Knowledge<string>;
  nextAction: Knowledge<string>;
  status: 'open' | 'resolved';
  resolution: Knowledge<string>;
  relatedIds: Id[];
  requiredBeforeReview: boolean;
}
export interface Risk extends OpenIssue {
  consequence: Knowledge<string>;
  mitigation: Knowledge<string>;
  testIds: Id[];
}
export interface Assumption extends OpenIssue {
  verificationAction: Knowledge<string>;
}
export interface Kpi extends RecordBase {
  definition: Knowledge<string>;
  baseline: Knowledge<Quantity>;
  target: Knowledge<Quantity>;
  measurementMethod: Knowledge<string>;
  measurementWindow: Knowledge<string>;
  needIds: Id[];
  workflowIds: Id[];
}
export interface Requirement extends RecordBase {
  capability: Knowledge<string>;
  rationale: Knowledge<string>;
  constraints: string[];
  needIds: Id[];
  workflowIds: Id[];
  kpiIds: Id[];
  testIds: Id[];
  verificationDisposition: Knowledge<string>;
}
export type Criterion =
  | { kind: 'numeric'; operator: 'gte' | 'lte' | 'eq' | 'between'; threshold: Quantity; upper?: Quantity }
  | { kind: 'boolean'; expected: boolean }
  | { kind: 'categorical'; expected: string[] };
export interface AcceptanceTest extends RecordBase {
  subjectIds: Id[];
  preconditions: string[];
  procedure: string[];
  measurementMethod: Knowledge<string>;
  criterion: Knowledge<Criterion>;
  evidenceRequirementIds: Id[];
  assessorId: Knowledge<Id>;
  approverId: Knowledge<Id>;
}
export interface Evidence extends RecordBase {
  purpose: 'planning' | 'acceptance-requirement' | 'decision';
  location:
    | { kind: 'attachment'; path: string; sha256: string; size: number }
    | { kind: 'external'; uri: string }
    | { kind: 'future'; description: string };
  required: boolean;
  relatedIds: Id[];
  provenance: Knowledge<string>;
}
export interface Decision extends RecordBase {
  question: Knowledge<string>;
  options: string[];
  rationale: Knowledge<string>;
  state: 'proposed' | 'accepted';
  relatedIds: Id[];
  actor: Actor | null;
  decidedAt: string | null;
}
export interface ChallengeAnswer extends RecordBase {
  promptId: string;
  promptVersion: string;
  answer: Knowledge<string>;
  relatedIds: Id[];
}
