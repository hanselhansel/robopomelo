import { checkSchema, type Deployment, type ObservedEvidence, type ProjectSnapshot } from '@robopomelo/spec';
import { planningHash } from '@robopomelo/core';
import { validateDeployment } from '../../../core/src/validation.js';
import { approvalDetails } from '../../../core/src/review-validity.js';
import { createHash } from 'node:crypto';
import { parseSource } from '../yaml/parse.js';
import type { SessionOptions } from '../contracts.js';
import { ProjectFsError } from '../errors.js';
import { byteHash } from './digest.js';
export async function observations(
  deployment: Deployment,
  options: SessionOptions,
): Promise<ObservedEvidence[]> {
  if (options.observeEvidence) return options.observeEvidence(deployment);
  return Promise.all(
    deployment.evidence.map(async (item) => {
      if (item.location.kind !== 'attachment')
        return { evidenceId: item.id, state: item.location.kind, checkedAt: null };
      const checkedAt = options.clock();
      try {
        const handle = await options.root.openRead(item.location.path);
        try {
          const hash = createHash('sha256');
          let size = 0;
          for (;;) {
            const bytes = await handle.readChunk();
            if (!bytes.length) break;
            size += bytes.length;
            if (size > 256 * 1024 * 1024)
              throw new ProjectFsError('LIMIT_EXCEEDED', 'Evidence exceeds the attachment limit.');
            hash.update(bytes);
          }
          const sha256 = hash.digest('hex');
          return {
            evidenceId: item.id,
            state:
              sha256 === item.location.sha256 && size === item.location.size
                ? ('present' as const)
                : ('mismatch' as const),
            sha256,
            size,
            checkedAt,
          };
        } finally {
          await handle.close();
        }
      } catch (error) {
        return {
          evidenceId: item.id,
          state:
            (error as { code?: string }).code === 'ENOENT' ? ('missing' as const) : ('unreadable' as const),
          checkedAt,
        };
      }
    }),
  );
}
export function deploymentBytes(bytes: Uint8Array, projectId: string) {
  const source = parseSource(bytes);
  if (checkSchema(source.value).length)
    throw new ProjectFsError('SOURCE_UNREADABLE', 'Source does not match the supported deployment schema.');
  const deployment = source.value as unknown as Deployment;
  if (deployment.project.id !== projectId)
    throw new ProjectFsError('PROJECT_MISMATCH', 'Source project identity differs from this session.');
  return { source, deployment };
}
export async function snapshotBytes(bytes: Uint8Array, options: SessionOptions): Promise<ProjectSnapshot> {
  const { deployment } = deploymentBytes(bytes, options.projectId);
  const evidenceObservations = await observations(deployment, options);
  const sourceHash = byteHash(bytes),
    sourceRevision = deployment.meta.revisionId;
  const validation = validateDeployment(deployment, {
    sourceHash,
    sourceRevision,
    toolVersion: options.toolVersion,
    evidence: evidenceObservations,
  });
  const details = approvalDetails(deployment, validation);
  return {
    deployment,
    sourceRevision,
    sourceHash,
    planningHash: planningHash(deployment),
    validation,
    approvalStatus: details.status,
    approvalDetails: details,
    evidenceObservations,
  };
}
