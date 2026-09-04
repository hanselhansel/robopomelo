import type { Acknowledgment, Actor, Deployment, Finding, Waiver } from '@robopomelo/spec';
import { planningHash } from '../planning-hash.js';
import type { Emit } from './catalogue.js';
const nonempty = (value: string): boolean => value.trim().length > 0;
export const validActor = (actor: Actor): boolean =>
  nonempty(actor.name) && ['human', 'agent', 'external'].includes(actor.kind);
export const validAcknowledgment = (a: Acknowledgment): boolean =>
  validActor(a.actor) && nonempty(a.reason) && nonempty(a.source) && nonempty(a.recordedAt);
export function matchesAcknowledgment(a: Acknowledgment, f: Finding, hash: string): boolean {
  return (
    f.severity === 'warning' &&
    validAcknowledgment(a) &&
    a.planningHash === hash &&
    a.findingFingerprint === f.fingerprint
  );
}
export function matchesWaiver(w: Waiver, f: Finding, d: Deployment, hash: string): boolean {
  return (
    f.waivable &&
    w.ruleId === f.ruleId &&
    matchesAcknowledgment(w, f, hash) &&
    w.evidenceIds.every((id) => d.evidence.some((e) => e.id === id))
  );
}
export function applyWarningDecisions(d: Deployment, findings: Finding[]): void {
  const hash = planningHash(d);
  for (const f of findings) {
    f.acknowledged = d.review.acknowledgments.some((a) => matchesAcknowledgment(a, f, hash));
    if (d.review.waivers.some((w) => matchesWaiver(w, f, d, hash))) f.status = 'waived';
  }
}
export function reviewRecords(d: Deployment, emit: Emit): void {
  for (const key of ['acknowledgments', 'waivers'] as const)
    d.review[key].forEach((a, i) => {
      if (!validAcknowledgment(a)) emit('RP-081', [a.id], [`/review/${key}/${i}`]);
    });
  d.review.approvals.forEach((a, i) => {
    if (
      !validActor(a.recorder) ||
      ![
        a.reviewerId,
        a.reviewerName,
        a.reviewerRole,
        a.source,
        a.decidedAt,
        a.sourceRevision,
        a.sourceHash,
        a.planningHash,
        a.ruleSetVersion,
      ].every(nonempty)
    )
      emit('RP-081', [a.id], [`/review/approvals/${i}`]);
  });
  d.review.revocations.forEach((r, i) => {
    if (!validActor(r.actor) || ![r.reason, r.source, r.recordedAt].every(nonempty))
      emit('RP-081', [r.id], [`/review/revocations/${i}`]);
  });
  d.decisions.forEach((r, i) => {
    if (
      r.state === 'accepted' &&
      (!r.actor ||
        !validActor(r.actor) ||
        !r.actor.source?.trim() ||
        !r.decidedAt ||
        !r.rationale ||
        !('value' in r.rationale) ||
        !r.rationale.value.trim())
    )
      emit('RP-081', [r.id], [`/decisions/${i}`]);
  });
}
