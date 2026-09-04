import {
  checkSchema,
  type Deployment,
  type PatchContext,
  type PatchEnvelope,
  type PatchEvaluation,
  type ReviewCommand,
} from '@robopomelo/spec';
import { DomainError } from './errors.js';
import { assertActor } from './permissions.js';
import { validateDeployment } from './validation.js';
import { approvalDetails } from './review-validity.js';
import { semanticDiff } from './diff.js';
import { sha256 } from './hash.js';
export function assertMutationBase(
  d: Deployment,
  command: PatchEnvelope | ReviewCommand,
  c: PatchContext,
  kind: 'patch' | 'review',
): void {
  const schema = checkSchema(command, kind);
  if (schema.length) throw new DomainError('INVALID_SCHEMA', `Invalid ${kind} structure.`, schema);
  const sourceSchema = checkSchema(d);
  if (sourceSchema.length)
    throw new DomainError('INVALID_SCHEMA', 'Source deployment violates the schema.', sourceSchema);
  if (command.projectId !== d.project.id)
    throw new DomainError('PROJECT_MISMATCH', 'Mutation targets another project.');
  if (
    command.baseRevision !== d.meta.revisionId ||
    command.baseRevision !== c.sourceRevision ||
    !c.sourceHash ||
    command.baseHash !== c.sourceHash
  )
    throw new DomainError('STALE_BASE', 'Mutation source revision or hash is stale.');
  if (!c.nextRevision || c.nextRevision === d.meta.revisionId)
    throw new DomainError('INVALID_REVISION', 'Supply a new revision ID.');
  if (!command.purpose.trim()) throw new DomainError('INVALID_PROVENANCE', 'Supply the mutation purpose.');
  assertActor(command.actor);
}
export function assertCandidate(d: Deployment, c: PatchContext): void {
  const report = validateDeployment(d, c);
  const invalid = report.findings.filter((f) =>
    ['RP-001', 'RP-002', 'RP-003', 'RP-004', 'RP-081'].includes(f.ruleId),
  );
  if (invalid.length)
    throw new DomainError(
      invalid.some((f) => f.ruleId === 'RP-003') ? 'INVALID_REFERENCE' : 'INVALID_SCHEMA',
      'Candidate structure, reference or provenance is invalid.',
      invalid,
    );
}
export function finishMutation(before: Deployment, candidate: Deployment, c: PatchContext): PatchEvaluation {
  const invalidatedApprovalIds: string[] = [];
  const selected = before.review.currentApprovalId;
  if (
    selected &&
    !before.review.invalidations.some((i) => i.approvalId === selected) &&
    !before.review.revocations.some((r) => r.approvalId === selected)
  ) {
    const beforeDetails = approvalDetails(before, validateDeployment(before, c));
    const oldSelection = structuredClone(candidate);
    oldSelection.review.currentApprovalId = selected;
    const afterDetails = approvalDetails(oldSelection, validateDeployment(oldSelection, c));
    const observed = (c.observedApprovalInvalidations ?? [])
      .filter((item) => item.approvalId === selected)
      .map((item) => ({ code: item.reason }));
    const reason = [...beforeDetails.reasons, ...afterDetails.reasons, ...observed].find(
      (r) =>
        r.code === 'planning-content-changed' ||
        r.code === 'required-evidence-changed' ||
        r.code === 'rule-context-changed',
    );
    if (reason && reason.code !== 'revoked' && reason.code !== 'validation-blocked') {
      candidate.review.invalidations.push({
        id: `invalidation-${sha256(`${selected}:${c.nextRevision}:${reason.code}`).slice(0, 32)}`,
        approvalId: selected,
        revisionId: c.nextRevision,
        recordedAt: c.timestamp,
        reason: reason.code,
      });
      invalidatedApprovalIds.push(selected);
    }
  }
  candidate.meta = {
    ...candidate.meta,
    parentRevisionId: before.meta.revisionId,
    revisionId: c.nextRevision,
    updatedAt: c.timestamp,
  };
  const candidateContext = { ...c, sourceRevision: c.nextRevision, sourceHash: null };
  assertCandidate(candidate, candidateContext);
  return {
    deployment: candidate,
    diff: semanticDiff(before, candidate),
    validation: validateDeployment(candidate, candidateContext),
    invalidatedApprovalIds,
  };
}
