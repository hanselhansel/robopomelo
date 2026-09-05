import { isDeepStrictEqual } from 'node:util';
import {
  checkSchema,
  type Mutation,
  type PatchContext,
  type PatchEvaluation,
  type ProjectSnapshot,
  type Scope,
} from '@robopomelo/spec';
import { evaluatePatch } from '../../../core/src/patches.js';
import { evaluateReview } from '../../../core/src/reviews.js';
import { ProjectFsError } from '../errors.js';
import type { CommitInput, SessionOptions } from '../contracts.js';
import { isId } from './journal.js';
import { closed } from './metadata.js';

/** Keeps only core-emitted observations from this running session. */
export class EvaluationState {
  #observed: NonNullable<PatchContext['observedApprovalInvalidations']> = [];
  constructor(private readonly options: SessionOptions) {}
  validate(input: CommitInput): void {
    const command = input.mutation.kind === 'patch' ? input.mutation.patch : input.mutation.review;
    if (
      !closed(
        input,
        ['expected', 'idempotencyKey', 'authorization', 'actor', 'mutation'],
        ['approvedPatchDigest', 'supersedesProposalId', 'stagedEvidence', 'operation'],
      ) ||
      !isId(input.idempotencyKey) ||
      command.id !== input.idempotencyKey ||
      command.projectId !== this.options.projectId ||
      checkSchema(command, input.mutation.kind).length ||
      !isDeepStrictEqual(input.actor, command.actor) ||
      command.baseHash !== input.expected.sourceHash ||
      command.baseRevision !== input.expected.sourceRevision
    )
      throw new ProjectFsError(
        'INVALID_MUTATION',
        'Mutation, actor, idempotency key and source base must agree.',
      );
  }
  recordObservations(snapshot: ProjectSnapshot): void {
    const approvalId = snapshot.approvalDetails.decisionId;
    if (!approvalId) return;
    for (const item of snapshot.approvalDetails.reasons)
      if (
        ['planning-content-changed', 'required-evidence-changed', 'rule-context-changed'].includes(item.code)
      ) {
        const reason = item.code as NonNullable<
          PatchContext['observedApprovalInvalidations']
        >[number]['reason'];
        if (
          !this.#observed.some((observed) => observed.approvalId === approvalId && observed.reason === reason)
        )
          this.#observed.push({ approvalId, reason });
      }
  }
  context(
    snapshot: ProjectSnapshot,
    scopes: Scope[],
    nextRevision = this.options.id(),
    timestamp = this.options.clock(),
  ): PatchContext {
    this.recordObservations(snapshot);
    return {
      sourceRevision: snapshot.sourceRevision,
      sourceHash: snapshot.sourceHash,
      toolVersion: this.options.toolVersion,
      evidence: snapshot.evidenceObservations,
      scopes,
      nextRevision,
      timestamp,
      observedApprovalInvalidations: [...this.#observed],
    };
  }
  evaluate(snapshot: ProjectSnapshot, mutation: Mutation, context: PatchContext): PatchEvaluation {
    return mutation.kind === 'patch'
      ? evaluatePatch(snapshot.deployment, mutation.patch, context)
      : evaluateReview(snapshot.deployment, mutation.review, context);
  }
}
