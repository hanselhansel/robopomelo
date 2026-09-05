import { createHash } from 'node:crypto';
import type { Deployment } from '@robopomelo/spec';
import type { SafeRoot } from '../fs/safe-fs.js';
import type { StagedEvidence } from '../contracts.js';
import { ProjectFsError } from '../errors.js';
import { directory } from './io.js';
export async function verifyFile(root: SafeRoot, path: string, hash: string, size: number): Promise<void> {
  const handle = await root.openRead(path);
  try {
    const digest = createHash('sha256');
    let total = 0;
    for (;;) {
      const bytes = await handle.readChunk();
      if (!bytes.length) break;
      total += bytes.length;
      if (total > size) throw new ProjectFsError('EVIDENCE_MISMATCH', 'Evidence size changed.');
      digest.update(bytes);
    }
    if (total !== size || digest.digest('hex') !== hash)
      throw new ProjectFsError('EVIDENCE_MISMATCH', 'Evidence hash or size changed.');
  } finally {
    await handle.close();
  }
}
export function bindsEvidence(deployment: Deployment, items: StagedEvidence[]): void {
  for (const item of items) {
    const evidence = deployment.evidence.find((e) => e.id === item.evidenceId);
    if (
      !evidence ||
      evidence.location.kind !== 'attachment' ||
      evidence.location.path !== item.finalPath ||
      evidence.location.sha256 !== item.sha256 ||
      evidence.location.size !== item.size
    )
      throw new ProjectFsError(
        'EVIDENCE_MISMATCH',
        'Staged evidence is not bound to the candidate declaration.',
      );
  }
}
export async function publishEvidence(root: SafeRoot, items: StagedEvidence[]): Promise<void> {
  if (items.length) await directory(root, 'evidence');
  for (const item of items) {
    await verifyFile(root, item.stagedPath, item.sha256, item.size);
    await root.renameNoReplace(item.stagedPath, item.finalPath);
    await verifyFile(root, item.finalPath, item.sha256, item.size);
  }
  if (items.length) await root.fsyncDirectory('evidence');
}
