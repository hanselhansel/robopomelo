import type { ApprovalDetails, ApprovalStatus, Deployment, ValidationReport } from '@robopomelo/spec';
import { planningHash } from './planning-hash.js';
import { matchesAcknowledgment, matchesWaiver } from './rules/review-records.js';
/** Assesses an existing report, never invokes validation or reads transient state. */
export function approvalDetails(d: Deployment, report: ValidationReport): ApprovalDetails {
  const decisionId = d.review.currentApprovalId;
  if (!decisionId) return { status: 'none', decisionId: null, reasons: [] };
  const approval = d.review.approvals.find((a) => a.id === decisionId);
  const reasons: ApprovalDetails['reasons'] = [];
  const add = (code: ApprovalDetails['reasons'][number]['code'], recordIds: string[], paths: string[]) => {
    if (!reasons.some((r) => r.code === code && r.recordIds.join() === recordIds.join()))
      reasons.push({ code, recordIds, paths });
  };
  if (!approval)
    return {
      status: 'stale',
      decisionId,
      reasons: [
        { code: 'validation-blocked', recordIds: [decisionId], paths: ['/review/currentApprovalId'] },
      ],
    };
  if (d.review.revocations.some((r) => r.approvalId === decisionId))
    return {
      status: 'revoked',
      decisionId,
      reasons: [{ code: 'revoked', recordIds: [decisionId], paths: ['/review/revocations'] }],
    };
  const hash = planningHash(d);
  for (const invalidation of d.review.invalidations.filter((i) => i.approvalId === decisionId))
    add(invalidation.reason, [decisionId], ['/review/invalidations']);
  if (approval.planningHash !== hash) add('planning-content-changed', [d.project.id], ['/project']);
  if (approval.ruleSetVersion !== report.ruleSetVersion)
    add('rule-context-changed', [decisionId], ['/review/approvals']);
  const currentFindings = report.findings.filter((f) => f.ruleId !== 'RP-080');
  for (const f of currentFindings.filter((f) => f.ruleId === 'RP-060' || f.ruleId === 'RP-062'))
    add('required-evidence-changed', f.recordIds, f.paths);
  if (approval.decision === 'approved') {
    const blockers = currentFindings.filter((f) => f.severity === 'blocker' && f.status === 'active');
    const undecided = currentFindings.filter(
      (f) =>
        f.severity === 'warning' &&
        !d.review.waivers.some((w) => approval.waiverIds.includes(w.id) && matchesWaiver(w, f, d, hash)) &&
        !d.review.acknowledgments.some(
          (a) => approval.acknowledgmentIds.includes(a.id) && matchesAcknowledgment(a, f, hash),
        ),
    );
    if (blockers.length || undecided.length)
      add(
        'validation-blocked',
        [...new Set([...blockers, ...undecided].flatMap((f) => f.recordIds))],
        [...new Set([...blockers, ...undecided].flatMap((f) => f.paths))],
      );
  }
  if (reasons.length) return { status: 'stale', decisionId, reasons };
  return { status: approval.decision === 'approved' ? 'current' : approval.decision, decisionId, reasons };
}
export function approvalStatus(d: Deployment, report: ValidationReport): ApprovalStatus {
  return approvalDetails(d, report).status;
}
