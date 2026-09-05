import { setTimeout as wait } from 'node:timers/promises';
import type { SafeRoot, SafeStat } from '../fs/safe-fs.js';
import { ProjectFsError } from '../errors.js';
import { byteHash } from './digest.js';
const sameFile = (a: SafeStat, b: SafeStat) =>
  a.kind === b.kind && a.device === b.device && a.fileId === b.fileId;
/** @internal Only prepared source commits use this retry, under their existing authority and lease. */
export async function replaceSource(
  root: SafeRoot,
  staged: string,
  hashes: { prior: string; next: string },
  options: { platform?: string; delay?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const originalStage = await root.stat(staged);
  const originalSource = await root.stat('deployment.yaml');
  const checkIdentity = async () => {
    if (!sameFile(originalStage, await root.stat(staged)))
      throw new ProjectFsError('RECOVERY_REQUIRED', 'Prepared source identity changed before replacement.');
    if (!sameFile(originalSource, await root.stat('deployment.yaml')))
      throw new ProjectFsError('STALE_BASE', 'Source identity changed before replacement.');
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    // Revalidate after every wait. A retry never adopts another writer's bytes or inode.
    await checkIdentity();
    if (byteHash(await root.readFile('deployment.yaml')) !== hashes.prior)
      throw new ProjectFsError('STALE_BASE', 'Source changed after transaction preparation.');
    if (byteHash(await root.readFile(staged)) !== hashes.next)
      throw new ProjectFsError('RECOVERY_REQUIRED', 'Prepared source bytes changed before replacement.');
    await checkIdentity();
    try {
      await root.renameReplace(staged, 'deployment.yaml');
      return;
    } catch (error) {
      const native = error as NodeJS.ErrnoException;
      if (
        (options.platform ?? process.platform) !== 'win32' ||
        native?.code !== 'EPERM' ||
        native?.syscall !== 'rename' ||
        attempt === 7
      )
        throw error;
      // At most 775ms deliberate backoff; filesystem I/O time is separate.
      await (options.delay ?? wait)(Math.min(25 * (attempt + 1), 150));
    }
  }
}
