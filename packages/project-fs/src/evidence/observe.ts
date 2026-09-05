import { createHash } from 'node:crypto';
import type { Deployment, ObservedEvidence } from '@robopomelo/spec';
import type { SafeRoot } from '../fs/safe-fs.js';
import { ProjectFsError } from '../errors.js';
import { ATTACHMENT_LIMIT } from './selection.js';
export async function observeEvidence(
  root: SafeRoot,
  deployment: Deployment,
  clock: () => string,
  ids?: string[],
): Promise<ObservedEvidence[]> {
  const selected = ids ? new Set(ids) : undefined;
  if (selected && [...selected].some((id) => !deployment.evidence.some((item) => item.id === id)))
    throw new ProjectFsError('EVIDENCE_NOT_FOUND', 'Evidence selection contains an unknown stable ID.');
  const results: ObservedEvidence[] = [];
  // Sequential handles keep large projects below native descriptor limits.
  for (const item of deployment.evidence) {
    if (selected && !selected.has(item.id)) continue;
    if (item.location.kind !== 'attachment') {
      results.push({ evidenceId: item.id, state: item.location.kind, checkedAt: null });
      continue;
    }
    const checkedAt = clock();
    try {
      const handle = await root.openRead(item.location.path);
      try {
        const before = await handle.stat(),
          hash = createHash('sha256');
        let size = 0;
        for (;;) {
          const bytes = await handle.readChunk();
          if (!bytes.length) break;
          size += bytes.length;
          if (size > ATTACHMENT_LIMIT)
            throw new ProjectFsError('LIMIT_EXCEEDED', 'Attachment exceeds its byte limit.');
          hash.update(bytes);
        }
        const after = await handle.stat(),
          sha256 = hash.digest('hex');
        const stable = before.size === after.size && before.mtimeMs === after.mtimeMs;
        results.push({
          evidenceId: item.id,
          state:
            stable && sha256 === item.location.sha256 && size === item.location.size ? 'present' : 'mismatch',
          sha256,
          size,
          checkedAt,
        });
      } finally {
        await handle.close();
      }
    } catch (error) {
      results.push({
        evidenceId: item.id,
        state: (error as { code?: string }).code === 'ENOENT' ? 'missing' : 'unreadable',
        checkedAt,
      });
    }
  }
  return results;
}
