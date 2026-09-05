import type { Mutation } from '@robopomelo/spec';
import type { CommitInput, Evaluation, RestoreInput, SessionOptions } from '../contracts.js';
import { evaluateRestore } from '../../../core/src/restore.js';
import { historyRead } from '../history.js';
import { ProjectFsError } from '../errors.js';
export async function prepareRestore(
  options: SessionOptions,
  revision: string,
  input: RestoreInput,
): Promise<{ input: CommitInput; evaluate: Evaluation }> {
  const { purpose, ...commitFields } = input;
  const historical = await historyRead(options.root, revision, options);
  if (
    historical.snapshot.evidenceObservations.some((item) =>
      ['missing', 'unreadable', 'mismatch'].includes(item.state),
    )
  )
    throw new ProjectFsError(
      'MISSING_HISTORY_EVIDENCE',
      'Restore requires the historical attachment bytes to be available and intact.',
    );
  const mutation: Mutation = {
    kind: 'patch',
    patch: {
      formatVersion: '1.0.0',
      id: input.idempotencyKey,
      projectId: options.projectId,
      baseRevision: input.expected.sourceRevision,
      baseHash: input.expected.sourceHash,
      actor: input.actor,
      purpose,
      operations: [],
    },
  };
  return {
    input: { ...commitFields, mutation, operation: { kind: 'restore', revision } },
    evaluate: (current, context) =>
      evaluateRestore(current, historical.snapshot.deployment, mutation.patch, context),
  };
}
