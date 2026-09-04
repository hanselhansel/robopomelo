import type {
  Actor,
  Deployment,
  FieldDiff,
  Mutation,
  ObservedEvidence,
  PatchContext,
  PatchEvaluation,
  ProjectSnapshot,
  Scope,
} from '@robopomelo/spec';
import type { SafeRoot } from './fs/safe-fs.js';
import type { TrustStore } from './settings/trust.js';
export type { RootIdentity } from './fs/safe-fs.js';
export interface Authorization {
  grantId: string;
  generation: number;
  scopes: Scope[];
}
export type SourceIdentity = Pick<ProjectSnapshot, 'sourceRevision' | 'sourceHash'>;
export interface KnowledgeProblem {
  code: string;
  message: string;
  line?: number;
  column?: number;
}
export type OpenResult =
  | { kind: 'readable'; snapshot: ProjectSnapshot; externalEdit: boolean }
  | { kind: 'inspection'; rawText: string; problems: KnowledgeProblem[]; lastReadable?: SourceIdentity };
export interface StagedEvidence {
  evidenceId: string;
  stagedPath: string;
  finalPath: string;
  sha256: string;
  size: number;
}
export interface CommitInput {
  expected: SourceIdentity;
  idempotencyKey: string;
  authorization: Authorization;
  actor: Actor;
  mutation: Mutation;
  approvedPatchDigest?: string;
  supersedesProposalId?: string;
  stagedEvidence?: StagedEvidence[];
  operation?: { kind: 'restore'; revision: string } | { kind: 'reconcile'; sourceHash: string };
}
export type CommitResult =
  | { kind: 'committed'; snapshot: ProjectSnapshot; diff: FieldDiff[]; receiptDigest: string }
  | { kind: 'proposal'; proposalId: string; patchDigest: string; diff: FieldDiff[]; receiptDigest: string }
  | {
      kind: 'conflict';
      expected: SourceIdentity;
      current: SourceIdentity;
      proposedDiff: FieldDiff[];
      mutation: Mutation;
    };
export type TransactionPhase =
  'journal-flushed' | 'evidence-published' | 'source-replaced' | 'history-complete';
export interface SessionOptions {
  root: SafeRoot;
  trust: TrustStore;
  projectId: string;
  authorization: Authorization;
  toolVersion: string;
  clock: () => string;
  id: () => string;
  observeEvidence?: (deployment: Deployment) => Promise<ObservedEvidence[]>;
  onProgress?: (event: { transactionId: string; phase: TransactionPhase }) => void | Promise<void>;
}
export interface RestoreInput {
  expected: SourceIdentity;
  idempotencyKey: string;
  authorization: Authorization;
  actor: Actor;
  purpose: string;
  approvedPatchDigest?: string;
}
export type Evaluation = (source: Deployment, context: PatchContext) => PatchEvaluation;
