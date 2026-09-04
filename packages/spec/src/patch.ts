import type { Actor, Id, Json } from './common.js';
import type { Deployment } from './deployment.js';
import type { Acknowledgment, Waiver, Approval, Revocation } from './review.js';

export interface Finding {
  ruleId: string; ruleVersion: string; severity: 'blocker' | 'warning';
  recordIds: Id[]; paths: string[]; message: string; nextAction: string;
  waivable: boolean; fingerprint: string; status: 'active' | 'waived'; acknowledged: boolean;
}
export interface EvidenceObservation {
  evidenceId: Id; state: 'present' | 'missing' | 'unreadable' | 'mismatch' | 'external' | 'future';
  sha256?: string; size?: number;
}
export interface ObservedEvidence extends EvidenceObservation { checkedAt: string | null }
export interface ValidationContext {
  sourceRevision: Id | null; sourceHash: string | null; toolVersion: string;
  evidence: EvidenceObservation[];
}
export interface ValidationReport {
  readiness: 'ready' | 'warnings' | 'blocked'; label: string; findings: Finding[];
  counts: { blockers: number; warnings: number; waived: number; unacknowledged: number };
  sourceRevision: Id | null; sourceHash: string | null;
  toolVersion: string; specVersion: string | null; ruleSetVersion: string;
}
export type ApprovalStatus = 'none' | 'current' | 'stale' | 'revoked' | 'rejected' | 'changes-requested';
export interface ApprovalDetails {
  status: ApprovalStatus; decisionId: Id | null;
  reasons: {code:'planning-content-changed'|'required-evidence-changed'|'rule-context-changed'|'revoked'|'validation-blocked'; recordIds:Id[]; paths:string[]}[];
}
export interface ProjectSnapshot {
  deployment: Deployment; sourceRevision: Id; sourceHash: string; planningHash: string;
  validation: ValidationReport; approvalStatus: ApprovalStatus; approvalDetails: ApprovalDetails;
  evidenceObservations: ObservedEvidence[];
}
export type Scope = 'inspect' | 'author' | 'evidence' | 'export' | 'record-decisions' | 'manage-settings';
export type Collection = 'stakeholders' | 'needs' | 'problems' | 'workflows' | 'challenges'
  | 'risks' | 'assumptions' | 'kpis' | 'requirements' | 'acceptanceTests' | 'evidence'
  | 'decisions' | 'challengeAnswers';
export type PatchOperation =
  | { op: 'add'; collection: Collection; record: Json }
  | { op: 'update'; collection: Collection; id: Id; fields: Record<string, Json> }
  | { op: 'remove'; collection: Collection; id: Id }
  | { op: 'project'; fields: Record<string, Json> };
export interface PatchEnvelope {
  formatVersion: '1.0.0'; id: Id; projectId: Id; baseRevision: Id; baseHash: string;
  actor: Actor; purpose: string; operations: PatchOperation[];
}
export interface PatchContext extends ValidationContext {
  scopes: Scope[]; nextRevision: Id; timestamp: string;
}
export interface FieldDiff { collection: string; id: Id; field: string; before: Json; after: Json }
export interface PatchEvaluation {
  deployment: Deployment; diff: FieldDiff[]; validation: ValidationReport; invalidatedApprovalIds: Id[];
}
export type ReviewInput =
  | { action: 'acknowledge'; records: Acknowledgment[] }
  | { action: 'waive'; record: Waiver }
  | { action: 'approve'; record: Approval }
  | { action: 'revoke'; record: Revocation };
export interface ReviewCommand {
  formatVersion: '1.0.0'; id: Id; projectId: Id; baseRevision: Id; baseHash: string;
  actor: Actor; purpose: string; input: ReviewInput;
}
export type Mutation = {kind:'patch'; patch:PatchEnvelope} | {kind:'review'; review:ReviewCommand};

export type MutationReceipt =
  | {status:'pending'; mutationId:Id; digest:string}
  | {status:'proposed'; mutationId:Id; digest:string; proposalId:Id; supersedes:Id|null}
  | {status:'committed'; mutationId:Id; digest:string; sourceRevision:Id; sourceHash:string}
  | {status:'not-found'; mutationId:Id; digest:string}
  | {status:'indeterminate'; mutationId:Id; digest:string; reason:string};
