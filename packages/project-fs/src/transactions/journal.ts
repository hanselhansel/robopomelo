import type { Actor, FieldDiff, Mutation } from '@robopomelo/spec';
import { checkSchema } from '@robopomelo/spec';
import type { CommitInput, SourceIdentity, StagedEvidence } from '../contracts.js';
import type { SafeRoot } from '../fs/safe-fs.js';
import { ProjectFsError } from '../errors.js';
import { projectRelativePath } from '../fs/paths.js';
import { jsonRead, transactionBase } from './io.js';
import { mutationDigest } from './digest.js';
import { isDeepStrictEqual } from 'node:util';
import {
  assertMetadata,
  closed,
  validActor,
  validDiff,
  validIdentity,
  validMutation,
  validOperation,
  validTimestamp,
  isHash,
  isId,
} from './metadata.js';
export { isHash, isId } from './metadata.js';
export interface Journal {
  version: 1;
  projectId: string;
  transactionId: string;
  mutationId: string;
  idempotencyKey: string;
  digest: string;
  prior: SourceIdentity;
  next: SourceIdentity;
  actor: Actor;
  createdAt: string;
  mutation: Mutation;
  diff: FieldDiff[];
  evidence: StagedEvidence[];
  supersedesProposalId?: string;
  operation?: CommitInput['operation'];
}
export function validateEvidence(additions: StagedEvidence[]): void {
  if (!Array.isArray(additions) || additions.length > 1000)
    throw new ProjectFsError('STORAGE_INVALID', 'Invalid evidence additions.');
  const ids = new Set<string>(),
    paths = new Set<string>();
  for (const item of additions) {
    if (
      !closed(item, ['evidenceId', 'stagedPath', 'finalPath', 'sha256', 'size']) ||
      !item ||
      !isId(item.evidenceId) ||
      ids.has(item.evidenceId) ||
      !isHash(item.sha256) ||
      !Number.isSafeInteger(item.size) ||
      item.size < 0 ||
      item.size > 256 * 1024 * 1024 ||
      typeof item.stagedPath !== 'string' ||
      !item.stagedPath.startsWith('.robopomelo/recovery/uploads/') ||
      typeof item.finalPath !== 'string' ||
      !/^evidence\/[A-Za-z0-9_-]{1,128}(?:\.[A-Za-z0-9]{1,12})?$/.test(item.finalPath) ||
      paths.has(item.finalPath)
    )
      throw new ProjectFsError(
        'STORAGE_INVALID',
        'Evidence must use unique generated staging and final paths.',
      );
    projectRelativePath(item.stagedPath);
    projectRelativePath(item.finalPath);
    ids.add(item.evidenceId);
    paths.add(item.finalPath);
  }
}
export function validateJournal(
  value: unknown,
  projectId: string,
  mutationId?: string,
): asserts value is Journal {
  const j = value as Journal;
  assertMetadata(value);
  if (
    !closed(
      value,
      [
        'version',
        'projectId',
        'transactionId',
        'mutationId',
        'idempotencyKey',
        'digest',
        'prior',
        'next',
        'actor',
        'createdAt',
        'mutation',
        'diff',
        'evidence',
      ],
      ['supersedesProposalId', 'operation'],
    ) ||
    !j ||
    typeof j !== 'object' ||
    j.version !== 1 ||
    j.projectId !== projectId ||
    !isId(j.transactionId) ||
    !isId(j.mutationId) ||
    j.idempotencyKey !== j.mutationId ||
    (mutationId !== undefined && j.mutationId !== mutationId) ||
    !isHash(j.digest) ||
    !validIdentity(j.prior) ||
    !validIdentity(j.next) ||
    !isId(j.prior?.sourceRevision) ||
    !isHash(j.prior?.sourceHash) ||
    !isId(j.next?.sourceRevision) ||
    !isHash(j.next?.sourceHash) ||
    j.next.sourceRevision === j.prior.sourceRevision ||
    !validActor(j.actor) ||
    !validTimestamp(j.createdAt) ||
    !validDiff(j.diff) ||
    !validMutation(j.mutation)
  )
    throw new ProjectFsError(
      'STORAGE_INVALID',
      'Transaction journal is invalid or belongs to another project.',
    );
  const command = j.mutation.kind === 'patch' ? j.mutation.patch : j.mutation.review;
  if (
    checkSchema(command, j.mutation.kind).length ||
    command.id !== j.mutationId ||
    command.projectId !== projectId ||
    command.baseHash !== j.prior.sourceHash ||
    command.baseRevision !== j.prior.sourceRevision
  )
    throw new ProjectFsError('STORAGE_INVALID', 'Journal mutation does not match its recorded source.');
  if (
    (j.supersedesProposalId !== undefined && !isId(j.supersedesProposalId)) ||
    (j.operation !== undefined &&
      (!validOperation(j.operation) ||
        (j.operation.kind === 'restore'
          ? !isId(j.operation.revision)
          : j.operation.kind !== 'reconcile' || j.operation.sourceHash !== j.prior.sourceHash))) ||
    !isDeepStrictEqual(j.actor, command.actor) ||
    mutationDigest(j as unknown as CommitInput) !== j.digest
  )
    throw new ProjectFsError(
      'STORAGE_INVALID',
      'Journal receipt digest does not bind its recorded operation.',
    );
  validateEvidence(j.evidence);
}
export async function readJournal(root: SafeRoot, projectId: string, id: string): Promise<Journal> {
  const value = await jsonRead(root, `${transactionBase(id)}/journal.json`);
  validateJournal(value, projectId, id);
  return value;
}
