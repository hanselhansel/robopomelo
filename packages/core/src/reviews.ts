import type {
  Acknowledgment,
  Approval,
  Deployment,
  Finding,
  PatchContext,
  PatchEvaluation,
  ReviewCommand,
  Waiver,
} from '@robopomelo/spec';
import { DomainError } from './errors.js';
import { assertCandidate, assertMutationBase, finishMutation } from './mutation-common.js';
import { assertDecisionRecorder, requireScope, same } from './permissions.js';
import { planningHash } from './planning-hash.js';
import { validateDeployment } from './validation.js';
import { buildReferenceIndex } from './references.js';
import { hasValue } from './knowledge.js';
import { matchesAcknowledgment, matchesWaiver, validAcknowledgment } from './rules/review-records.js';
function assertDecisionEvidence(d: Deployment, ids: string[]): void {
  if (ids.some((id) => !d.evidence.some((e) => e.id === id)))
    throw new DomainError('INVALID_REFERENCE', 'Decision evidence must reference existing evidence.');
}
function assertSuppliedAcknowledgment(d: Deployment, a: Acknowledgment, command: ReviewCommand): void {
  if (!validAcknowledgment(a) || a.actor.kind === 'agent')
    throw new DomainError('INVALID_PROVENANCE', 'Supply an attributed human warning decision.');
  assertDecisionRecorder(command.actor, a.actor.name, a.source);
  if (a.planningHash !== planningHash(d))
    throw new DomainError('STALE_REVIEW', 'The warning decision targets stale reviewed planning content.');
}
function assertWarningBinding(d: Deployment, a: Acknowledgment, findings: Finding[], waiver?: Waiver): void {
  const hash = planningHash(d),
    f = findings.find((f) => f.fingerprint === a.findingFingerprint);
  if (!f)
    throw new DomainError(
      'FINDING_NOT_APPLICABLE',
      'Warning decision does not target an applicable finding.',
    );
  if (waiver ? !matchesWaiver(waiver, f, d, hash) : !matchesAcknowledgment(a, f, hash))
    throw new DomainError(
      waiver ? 'WAIVER_NOT_ALLOWED' : 'FINDING_NOT_APPLICABLE',
      waiver ? 'This finding cannot be waived.' : 'Only an applicable warning can be acknowledged.',
    );
}
function assertApproval(d: Deployment, a: Approval, command: ReviewCommand, c: PatchContext): void {
  if (
    a.sourceRevision !== c.sourceRevision ||
    a.sourceHash !== c.sourceHash ||
    a.planningHash !== planningHash(d) ||
    a.ruleSetVersion !== validateDeployment(d, c).ruleSetVersion
  )
    throw new DomainError(
      'STALE_REVIEW',
      'Approval must match exact reviewed source, planning content and rules.',
    );
  const designated = hasValue(d.project.approverId) ? d.project.approverId.value : null;
  const reviewer = d.stakeholders.find((s) => s.id === a.reviewerId);
  if (!reviewer || a.reviewerId !== designated || a.reviewerName !== reviewer.title || !a.reviewerRole.trim())
    throw new DomainError(
      'INVALID_REVIEWER',
      'Supply the designated stakeholder approver and their declared name and role.',
    );
  if (!same(a.recorder, command.actor))
    throw new DomainError('INVALID_PROVENANCE', 'Approval recorder must match the command actor.');
  assertDecisionRecorder(command.actor, a.reviewerName, a.source);
  assertDecisionEvidence(d, a.evidenceIds);
}
export function evaluateReview(d: Deployment, command: ReviewCommand, c: PatchContext): PatchEvaluation {
  assertMutationBase(d, command, c, 'review');
  requireScope(c, 'record-decisions');
  const candidate = structuredClone(d),
    input = command.input;
  const index = buildReferenceIndex(d);
  const fresh = (id: string) => {
    if (index.has(id)) throw new DomainError('DUPLICATE_ID', `Review record ID already exists: ${id}`);
    index.set(id, { id, collection: 'review', path: '/review', record: { id } });
  };
  const findings = validateDeployment(d, c).findings;
  if (input.action === 'acknowledge') {
    if (!input.records.length)
      throw new DomainError('EMPTY_REVIEW', 'Supply at least one deliberate warning acknowledgment.');
    for (const a of input.records) {
      fresh(a.id);
      assertSuppliedAcknowledgment(d, a, command);
      assertWarningBinding(d, a, findings);
      candidate.review.acknowledgments.push(structuredClone(a));
    }
  } else if (input.action === 'waive') {
    const w = input.record;
    fresh(w.id);
    assertSuppliedAcknowledgment(d, w, command);
    assertDecisionEvidence(d, w.evidenceIds);
    assertWarningBinding(d, w, findings, w);
    candidate.review.waivers.push(structuredClone(w));
  } else if (input.action === 'revoke') {
    const r = input.record;
    fresh(r.id);
    if (!d.review.approvals.some((a) => a.id === r.approvalId))
      throw new DomainError('INVALID_REFERENCE', 'Revocation references an unknown approval.');
    if (r.actor.kind === 'agent' || !r.reason.trim())
      throw new DomainError('INVALID_PROVENANCE', 'Supply the human revocation and reason.');
    assertDecisionRecorder(command.actor, r.actor.name, r.source);
    candidate.review.revocations.push(structuredClone(r));
  } else {
    const a = input.record;
    fresh(a.id);
    assertApproval(d, a, command, c);
    candidate.review.approvals.push(structuredClone(a));
    candidate.review.currentApprovalId = a.id;
    assertCandidate(candidate, c);
    // The new selection makes earlier RP-080 historical. The assessor and gate never recurse.
    const applicable = validateDeployment(candidate, c).findings.filter((f) => f.ruleId !== 'RP-080');
    for (const id of a.acknowledgmentIds) {
      const ack = candidate.review.acknowledgments.find((r) => r.id === id);
      if (!ack) throw new DomainError('INVALID_REFERENCE', 'Missing acknowledgment record.');
      assertWarningBinding(candidate, ack, applicable);
    }
    for (const id of a.waiverIds) {
      const w = candidate.review.waivers.find((r) => r.id === id);
      if (!w) throw new DomainError('INVALID_REFERENCE', 'Missing waiver record.');
      assertWarningBinding(candidate, w, applicable, w);
    }
    if (a.decision === 'approved') {
      if (applicable.some((f) => f.severity === 'blocker' && f.status === 'active'))
        throw new DomainError(
          'SPECIFICATION_BLOCKED',
          'Specification is blocked; resolve blockers before approval.',
        );
      const hash = planningHash(candidate);
      const undecided = applicable.filter(
        (f) =>
          f.severity === 'warning' &&
          !candidate.review.acknowledgments.some(
            (ack) => a.acknowledgmentIds.includes(ack.id) && matchesAcknowledgment(ack, f, hash),
          ) &&
          !candidate.review.waivers.some(
            (w) => a.waiverIds.includes(w.id) && matchesWaiver(w, f, candidate, hash),
          ),
      );
      if (undecided.length)
        throw new DomainError(
          'WARNINGS_UNACKNOWLEDGED',
          'Applicable warnings require explicit acknowledgment or an eligible waiver.',
          undecided,
        );
    }
  }
  return finishMutation(d, candidate, c);
}
