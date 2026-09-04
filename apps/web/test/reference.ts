import {
  createInboundExample,
  planningHash,
  validateDeployment,
  approvalDetails,
  reviewDocument,
  traceability,
} from '@robopomelo/core';
import type { ProjectSnapshot } from '@robopomelo/spec';
export const deployment = createInboundExample({
  id: 'fixture-project',
  revision: 'r1',
  timestamp: '2026-09-05T00:00:00Z',
});
const validation = validateDeployment(deployment, {
  sourceRevision: 'r1',
  sourceHash: 'a'.repeat(64),
  toolVersion: '1.0.0-rc.1',
  evidence: [],
});
export const snapshot: ProjectSnapshot = {
  deployment,
  validation,
  sourceRevision: 'r1',
  sourceHash: 'a'.repeat(64),
  planningHash: planningHash(deployment),
  approvalStatus: 'none',
  approvalDetails: approvalDetails(deployment, validation),
  evidenceObservations: [],
};
export const document = reviewDocument(deployment, validation);
export const traceabilityRows = traceability(deployment);
