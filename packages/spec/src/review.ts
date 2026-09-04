import type { Actor, Id } from './common.js';

export interface Acknowledgment {
  id: Id; findingFingerprint: string; planningHash: string;
  actor: Actor; reason: string; recordedAt: string; source: string;
}
export interface Waiver extends Acknowledgment { ruleId: string; evidenceIds: Id[] }
export interface Approval {
  id: Id; reviewerId: Id; reviewerName: string; recorder: Actor; reviewerRole: string;
  decision: 'approved' | 'rejected' | 'changes-requested'; decidedAt: string; source: string;
  sourceRevision: Id; sourceHash: string; planningHash: string; ruleSetVersion: string;
  acknowledgmentIds: Id[]; waiverIds: Id[]; evidenceIds: Id[];
}
export interface Revocation { id: Id; approvalId: Id; actor: Actor; reason: string; source: string; recordedAt: string }
export interface ApprovalInvalidation {
  id: Id; approvalId: Id; revisionId: Id; recordedAt: string;
  reason: 'planning-content-changed' | 'required-evidence-changed' | 'rule-context-changed';
}
export interface ReviewState {
  currentApprovalId: Id | null; acknowledgments: Acknowledgment[];
  waivers: Waiver[]; approvals: Approval[]; revocations: Revocation[];
  invalidations: ApprovalInvalidation[];
}
