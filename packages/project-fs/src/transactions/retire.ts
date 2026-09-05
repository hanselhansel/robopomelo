import type { Actor } from '@robopomelo/spec';
import type { Authorization, SessionOptions, SourceIdentity } from '../contracts.js';
import type { SafeRoot } from '../fs/safe-fs.js';
import { acquireLock } from '../fs/lock.js';
import { ProjectFsError } from '../errors.js';
import { byteHash } from './digest.js';
import { readJournal, type Journal } from './journal.js';
import { jsonRead, jsonWrite, transactionBase, missing } from './io.js';
import { closed, validActor, validIdentity, validTimestamp } from './metadata.js';
import { verifiedSnapshots } from './recover.js';
export interface RetirementInput {
  authorization: Authorization;
  actor: Actor;
  reason: string;
}
export interface RetiredMarker {
  version: 1;
  projectId: string;
  mutationId: string;
  digest: string;
  prior: SourceIdentity;
  retiredAt: string;
  actor: Actor;
  reason: string;
}
export async function readRetirement(root: SafeRoot, journal: Journal): Promise<RetiredMarker | undefined> {
  let value: unknown;
  try {
    value = await jsonRead(root, `${transactionBase(journal.mutationId)}/retired.json`);
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
  const r = value as RetiredMarker;
  if (
    !closed(value, [
      'version',
      'projectId',
      'mutationId',
      'digest',
      'prior',
      'retiredAt',
      'actor',
      'reason',
    ]) ||
    r.version !== 1 ||
    r.projectId !== journal.projectId ||
    r.mutationId !== journal.mutationId ||
    r.digest !== journal.digest ||
    !validIdentity(r.prior) ||
    r.prior.sourceHash !== journal.prior.sourceHash ||
    r.prior.sourceRevision !== journal.prior.sourceRevision ||
    !validActor(r.actor) ||
    !validTimestamp(r.retiredAt) ||
    typeof r.reason !== 'string' ||
    !r.reason.trim() ||
    r.reason.length > 16_384
  )
    throw new ProjectFsError(
      'STORAGE_INVALID',
      'Retirement marker is malformed or not bound to this attempt.',
    );
  try {
    await root.stat(`${transactionBase(journal.mutationId)}/committed.json`);
    throw new ProjectFsError(
      'STORAGE_INVALID',
      'Attempt contains contradictory committed and retired markers.',
    );
  } catch (error) {
    if (!missing(error)) throw error;
  }
  return r;
}
export async function retirePrepared(
  options: SessionOptions,
  id: string,
  digest: string,
  input: RetirementInput,
): Promise<RetiredMarker> {
  if (
    !validActor(input.actor) ||
    typeof input.reason !== 'string' ||
    !input.reason.trim() ||
    input.reason.length > 16_384
  )
    throw new ProjectFsError('INVALID_PROVENANCE', 'Supply the recorder and retirement reason.');
  const lease = await acquireLock(options.root, 'project', { timeoutMs: 10_000 });
  try {
    return await options.trust.withAuthorization(
      { ...options.root.identity(), projectId: options.projectId },
      input.authorization,
      ['author'],
      async () => {
        const journal = await readJournal(options.root, options.projectId, id);
        if (journal.digest !== digest)
          throw new ProjectFsError(
            'IDEMPOTENCY_CONFLICT',
            'Retirement digest differs from the recorded attempt.',
          );
        const existing = await readRetirement(options.root, journal);
        if (existing) return existing;
        await verifiedSnapshots(options, journal);
        try {
          await options.root.stat(`${transactionBase(id)}/committed.json`);
          throw new ProjectFsError('MUTATION_COMMITTED', 'A committed attempt cannot be retired.');
        } catch (error) {
          if (!missing(error)) throw error;
        }
        if (byteHash(await options.root.readFile('deployment.yaml')) !== journal.prior.sourceHash)
          throw new ProjectFsError(
            'RECOVERY_INDETERMINATE',
            'Only an exact unchanged old source permits retirement.',
          );
        if (
          byteHash(await options.root.readFile(`${transactionBase(id)}/replacement.yaml`)) !==
          journal.next.sourceHash
        )
          throw new ProjectFsError(
            'RECOVERY_INDETERMINATE',
            'The uncommitted replacement candidate is missing or changed.',
          );
        const marker: RetiredMarker = {
          version: 1,
          projectId: options.projectId,
          mutationId: id,
          digest,
          prior: journal.prior,
          retiredAt: options.clock(),
          actor: input.actor,
          reason: input.reason,
        };
        await jsonWrite(options.root, `${transactionBase(id)}/retired.json`, marker);
        await options.root.fsyncDirectory(transactionBase(id));
        return marker;
      },
    );
  } finally {
    await lease.release();
  }
}
