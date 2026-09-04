import { isDeepStrictEqual } from 'node:util';
import { evaluateRestore } from '../../core/src/restore.js';
import type { Actor, Mutation, ProjectSnapshot } from '@robopomelo/spec';
import type { Authorization, CommitInput, Evaluation, SessionOptions } from './contracts.js';
import { snapshotBytes } from './transactions/snapshot.js';
import { ProjectFsError } from './errors.js';
import { missing } from './transactions/io.js';
import { historyRead, historyList } from './history.js';
export async function knownBaseline(
  options: SessionOptions,
  current: ProjectSnapshot,
): Promise<ProjectSnapshot> {
  try {
    return (await historyRead(options.root, current.sourceRevision, options)).snapshot;
  } catch (error) {
    if (!missing(error)) throw error;
  }
  const entries = await historyList(options.root, options);
  if (!entries.length) return current;
  const parents = new Set(entries.map((entry) => entry.parentRevisionId));
  const heads = entries.filter((entry) => !parents.has(entry.sourceRevision));
  if (heads.length !== 1)
    throw new ProjectFsError(
      'HISTORY_AMBIGUOUS',
      'History has no unique prior head. Inspect its branches before reconciling source.',
    );
  return (await historyRead(options.root, heads[0]!.sourceRevision, options)).snapshot;
}
export async function prepareExternalReconciliation(
  options: SessionOptions,
  expectedHash: string,
  actor: Actor,
  authorization: Authorization,
  last?: ProjectSnapshot,
): Promise<{ input: CommitInput; evaluate: Evaluation }> {
  const current = await snapshotBytes(await options.root.readFile('deployment.yaml'), options);
  if (current.sourceHash !== expectedHash)
    throw new ProjectFsError('STALE_BASE', 'External source changed before reconciliation.');
  let previous = last;
  if (!previous || previous.sourceHash === current.sourceHash)
    previous = await knownBaseline(options, current);
  previous ??= current;
  if (!isDeepStrictEqual(previous.deployment.review, current.deployment.review))
    throw new ProjectFsError(
      'REVIEW_RECONCILIATION_REQUIRED',
      'External review edits require an explicit decision-recording operation.',
    );
  const baseline = structuredClone(previous.deployment);
  baseline.meta = structuredClone(current.deployment.meta);
  const id = options.id();
  // Preserve the recorder's identity so agent delegation checks remain active.
  // The operation and history origin separately record the external-source fact.
  const externalActor = { ...actor };
  const mutation: Mutation = {
    kind: 'patch',
    patch: {
      formatVersion: '1.0.0',
      id,
      projectId: options.projectId,
      baseRevision: current.sourceRevision,
      baseHash: current.sourceHash,
      actor: externalActor,
      purpose: 'Reconcile explicitly observed external source edits',
      operations: [],
    },
  };
  const expected = { sourceRevision: current.sourceRevision, sourceHash: current.sourceHash };
  return {
    input: {
      expected,
      idempotencyKey: id,
      authorization,
      actor: externalActor,
      mutation,
      operation: { kind: 'reconcile', sourceHash: expectedHash },
    },
    evaluate: (_source, context) => evaluateRestore(baseline, current.deployment, mutation.patch, context),
  };
}
