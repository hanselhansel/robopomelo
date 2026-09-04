import type { SessionOptions } from '../contracts.js';
import { acquireLock } from '../fs/lock.js';
import { ProjectFsError } from '../errors.js';
import { byteHash } from './digest.js';
import { transactionBase, jsonRead, jsonWrite, listOrEmpty, missing } from './io.js';
import { validateJournal } from './journal.js';
import type { Journal } from './journal.js';
import { deploymentBytes } from './snapshot.js';
import { bindsEvidence, verifyFile } from './evidence.js';
import { finalizeHistory, historyRead } from '../history.js';
import { readRetirement } from './retire.js';
export type RecoveryResult = {
  mutationId: string;
  kind: 'finalized' | 'uncommitted' | 'indeterminate' | 'retired';
  reason?: string;
};
export async function verifiedSnapshots(
  options: SessionOptions,
  journal: Journal,
): Promise<{ oldBytes: Buffer; newBytes: Buffer }> {
  const base = transactionBase(journal.mutationId);
  const oldBytes = await options.root.readFile(`${base}/old.yaml`),
    newBytes = await options.root.readFile(`${base}/new.yaml`);
  if (byteHash(oldBytes) !== journal.prior.sourceHash || byteHash(newBytes) !== journal.next.sourceHash)
    throw new ProjectFsError('STORAGE_INVALID', 'Journal source snapshots do not match their hashes.');
  const old = deploymentBytes(oldBytes, options.projectId).deployment,
    next = deploymentBytes(newBytes, options.projectId).deployment;
  if (
    old.meta.revisionId !== journal.prior.sourceRevision ||
    next.meta.revisionId !== journal.next.sourceRevision ||
    next.meta.parentRevisionId !== old.meta.revisionId
  )
    throw new ProjectFsError('STORAGE_INVALID', 'Journal revision chain is inconsistent.');
  bindsEvidence(next, journal.evidence);
  return { oldBytes, newBytes };
}
export async function recoverJournal(options: SessionOptions, journal: Journal): Promise<RecoveryResult> {
  const { oldBytes, newBytes } = await verifiedSnapshots(options, journal);
  if (await readRetirement(options.root, journal)) return { mutationId: journal.mutationId, kind: 'retired' };
  try {
    const marker = (await jsonRead(
      options.root,
      `${transactionBase(journal.mutationId)}/committed.json`,
    )) as Record<string, unknown>;
    const history = await historyRead(options.root, journal.next.sourceRevision, options);
    if (
      marker.mutationId !== journal.mutationId ||
      marker.digest !== journal.digest ||
      marker.sourceRevision !== journal.next.sourceRevision ||
      marker.sourceHash !== journal.next.sourceHash ||
      history.snapshot.sourceHash !== journal.next.sourceHash
    )
      throw new ProjectFsError('STORAGE_INVALID', 'Committed marker does not match immutable history.');
    return { mutationId: journal.mutationId, kind: 'finalized' };
  } catch (error) {
    if (!missing(error)) throw error;
  }
  const current = byteHash(await options.root.readFile('deployment.yaml'));
  if (current === journal.prior.sourceHash) return { mutationId: journal.mutationId, kind: 'uncommitted' };
  if (current !== journal.next.sourceHash)
    return {
      mutationId: journal.mutationId,
      kind: 'indeterminate',
      reason: 'Source matches neither journal candidate. It was preserved.',
    };
  for (const item of journal.evidence) await verifyFile(options.root, item.finalPath, item.sha256, item.size);
  // This only finishes history for an already present exact committed source.
  // An untrusted journal can never authorize installing its uncommitted source.
  await finalizeHistory(options.root, journal, oldBytes, newBytes);
  await jsonWrite(options.root, `${transactionBase(journal.mutationId)}/committed.json`, {
    version: 1,
    mutationId: journal.mutationId,
    digest: journal.digest,
    ...journal.next,
  });
  await options.root.fsyncDirectory(transactionBase(journal.mutationId));
  return { mutationId: journal.mutationId, kind: 'finalized' };
}
export async function recoverTransactions(options: SessionOptions): Promise<RecoveryResult[]> {
  const lease = await acquireLock(options.root, 'project', { timeoutMs: 10_000 });
  try {
    const results: RecoveryResult[] = [];
    for (const entry of await listOrEmpty(options.root, '.robopomelo/recovery')) {
      if (!/^[a-f0-9]{64}$/.test(entry)) continue;
      let id = entry;
      try {
        const journal = await jsonRead(options.root, `.robopomelo/recovery/${entry}/journal.json`);
        validateJournal(journal, options.projectId);
        if (byteHash(journal.mutationId) !== entry)
          throw new ProjectFsError('STORAGE_INVALID', 'Journal directory does not match mutation ID.');
        id = journal.mutationId;
        results.push(await recoverJournal(options, journal));
      } catch (error) {
        results.push({
          mutationId: id,
          kind: 'indeterminate',
          reason:
            error instanceof ProjectFsError
              ? error.message
              : 'Recovery data is incomplete. Source was preserved.',
        });
      }
    }
    return results;
  } finally {
    await lease.release();
  }
}
