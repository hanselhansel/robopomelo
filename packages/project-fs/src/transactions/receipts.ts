import type { MutationReceipt } from '@robopomelo/spec';
import type { SessionOptions } from '../contracts.js';
import { ProjectFsError } from '../errors.js';
import { readJournal, isHash, isId } from './journal.js';
import { byteHash } from './digest.js';
import { missing, jsonRead, transactionBase, proposalBase } from './io.js';
import { verifiedSnapshots } from './recover.js';
import { verifyFile } from './evidence.js';
import { historyRead } from '../history.js';
import { proposalRead } from '../proposals/store.js';
import { readRetirement } from './retire.js';
export async function mutationStatus(
  options: SessionOptions,
  id: string,
  digest: string,
): Promise<MutationReceipt> {
  if (!isId(id) || !isHash(digest))
    throw new ProjectFsError('INVALID_RECEIPT', 'A valid mutation ID and digest are required.');
  let exists = false;
  try {
    await options.root.stat(transactionBase(id));
    exists = true;
  } catch (error) {
    if (!missing(error)) throw error;
  }
  if (exists) {
    try {
      const journal = await readJournal(options.root, options.projectId, id);
      if (journal.digest !== digest)
        throw new ProjectFsError('IDEMPOTENCY_CONFLICT', 'Mutation ID was used with a different digest.');
      await verifiedSnapshots(options, journal);
      const retired = await readRetirement(options.root, journal);
      if (retired)
        return {
          status: 'retired',
          mutationId: id,
          digest,
          retiredAt: retired.retiredAt,
          reason: retired.reason,
        };
      const current = byteHash(await options.root.readFile('deployment.yaml'));
      if (current === journal.next.sourceHash) {
        for (const item of journal.evidence)
          await verifyFile(options.root, item.finalPath, item.sha256, item.size);
        return { status: 'committed', mutationId: id, digest, ...journal.next };
      }
      try {
        const marker = (await jsonRead(options.root, `${transactionBase(id)}/committed.json`)) as Record<
          string,
          unknown
        >;
        const historical = await historyRead(options.root, journal.next.sourceRevision, options);
        if (
          marker.mutationId !== id ||
          marker.digest !== digest ||
          marker.sourceHash !== journal.next.sourceHash ||
          historical.snapshot.sourceHash !== journal.next.sourceHash
        )
          throw new ProjectFsError('STORAGE_INVALID', 'Committed receipt does not match immutable history.');
        return { status: 'committed', mutationId: id, digest, ...journal.next };
      } catch (error) {
        if (!missing(error)) throw error;
      }
      if (current === journal.prior.sourceHash) return { status: 'pending', mutationId: id, digest };
      return {
        status: 'indeterminate',
        mutationId: id,
        digest,
        reason: 'Source matches neither recorded candidate.',
      };
    } catch (error) {
      if (error instanceof ProjectFsError && error.code === 'IDEMPOTENCY_CONFLICT') throw error;
      return {
        status: 'indeterminate',
        mutationId: id,
        digest,
        reason: 'Transaction metadata or source snapshots are damaged or incomplete.',
      };
    }
  }
  try {
    const proposal = await proposalRead(options, id);
    if (proposal.requestDigest !== digest)
      throw new ProjectFsError('IDEMPOTENCY_CONFLICT', 'Mutation ID was used with a different digest.');
    return {
      status: 'proposed',
      mutationId: id,
      digest,
      proposalId: proposal.proposalId,
      supersedes: proposal.supersedes,
    };
  } catch (error) {
    if (missing(error)) {
      try {
        await options.root.stat(`${proposalBase(id)}.yaml`);
        return {
          status: 'indeterminate',
          mutationId: id,
          digest,
          reason: 'Proposal metadata is incomplete.',
        };
      } catch (candidateError) {
        if (missing(candidateError)) return { status: 'not-found', mutationId: id, digest };
        throw candidateError;
      }
    }
    if (error instanceof ProjectFsError && error.code === 'IDEMPOTENCY_CONFLICT') throw error;
    return { status: 'indeterminate', mutationId: id, digest, reason: 'Stored proposal is invalid.' };
  }
}
