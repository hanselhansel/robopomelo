import { checkSchema, type Deployment, type ObservedEvidence, type ProjectSnapshot } from '@robopomelo/spec';
import { planningHash } from '@robopomelo/core';
import { validateDeployment } from '../../../core/src/validation.js';
import { approvalDetails } from '../../../core/src/review-validity.js';
import { parseSource } from '../yaml/parse.js';
import type { SessionOptions } from '../contracts.js';
import { ProjectFsError } from '../errors.js';
import { byteHash } from './digest.js';
import { observeEvidence } from '../evidence/observe.js';
export async function observations(
  deployment: Deployment,
  options: SessionOptions,
): Promise<ObservedEvidence[]> {
  if (options.observeEvidence) return options.observeEvidence(deployment);
  return observeEvidence(options.root, deployment, options.clock);
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
