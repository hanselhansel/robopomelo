import type { SessionOptions } from '../contracts.js';
import { acquireLock } from '../fs/lock.js';
import { byteHash } from '../transactions/digest.js';
import { jsonRead, jsonWrite, missing } from '../transactions/io.js';
import { closed, isHash, isId, validActor } from '../transactions/metadata.js';
import { deploymentBytes } from '../transactions/snapshot.js';
import { ProjectFsError } from '../errors.js';
import { writeInitialHistory } from '../history.js';
import { verifyBackup } from './backup.js';

/** Complete bookkeeping only when the exact validated target is already source. */
export async function recoverMigration(options: SessionOptions, manifestPath: string) {
  const { root, trust, projectId } = options;
  await trust.withAuthorization(
    { ...root.identity(), projectId },
    options.authorization,
    ['inspect'],
    async () => {},
  );
  const lease = await acquireLock(root, 'project', { timeoutMs: 10_000 });
  try {
    const backup = await verifyBackup(root, manifestPath, projectId),
      base = manifestPath.slice(0, -'/manifest.json'.length);
    let log: unknown;
    try {
      log = await jsonRead(root, `${base}/migration.json`);
    } catch (error) {
      if (missing(error))
        return { kind: 'backup-only' as const, manifestPath, sourceHash: backup.sourceHash };
      throw error;
    }
    if (
      !closed(log, [
        'version',
        'projectId',
        'from',
        'to',
        'sourceHash',
        'targetHash',
        'sourceRevision',
        'targetRevision',
        'actor',
      ]) ||
      log.version !== 1 ||
      log.projectId !== projectId ||
      log.from !== backup.specVersion ||
      log.to !== '1.0.0' ||
      log.sourceHash !== backup.sourceHash ||
      log.sourceRevision !== backup.sourceRevision ||
      !isHash(log.targetHash) ||
      !isId(log.targetRevision) ||
      !validActor(log.actor)
    )
      throw new ProjectFsError(
        'MIGRATION_INVALID',
        'Migration bookkeeping is invalid. Source was preserved.',
      );
    let applied = false;
    try {
      const marker = await jsonRead(root, `${base}/applied.json`);
      if (
        !closed(marker, ['version', 'targetHash', 'targetRevision']) ||
        marker.version !== 1 ||
        marker.targetHash !== log.targetHash ||
        marker.targetRevision !== log.targetRevision
      )
        throw new ProjectFsError('MIGRATION_INVALID', 'Applied migration marker is inconsistent.');
      applied = true;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    const current = byteHash(await root.readFile('deployment.yaml'));
    if (current === backup.sourceHash && !applied)
      return { kind: 'uncommitted' as const, manifestPath, sourceHash: current };
    if (current !== log.targetHash)
      return { kind: 'indeterminate' as const, manifestPath, sourceHash: current };
    const bytes = await root.readFile(`${base}/candidate.yaml`),
      candidate = deploymentBytes(bytes, projectId).deployment;
    if (byteHash(bytes) !== log.targetHash || candidate.meta.revisionId !== log.targetRevision)
      throw new ProjectFsError('MIGRATION_INVALID', 'Migration candidate differs from the present source.');
    await writeInitialHistory(root, bytes, { projectId, actor: log.actor });
    await jsonWrite(root, `${base}/applied.json`, {
      version: 1,
      targetHash: log.targetHash,
      targetRevision: log.targetRevision,
    });
    await root.fsyncDirectory(base);
    return {
      kind: 'finalized' as const,
      manifestPath,
      sourceHash: log.targetHash,
      sourceRevision: log.targetRevision,
    };
  } finally {
    await lease.release();
  }
}
