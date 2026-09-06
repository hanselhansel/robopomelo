import { createHash } from 'node:crypto';
import type { ProjectService } from '../services/project.js';

/** Observation only: no parsing, reconciliation, settings writes or authority changes. */
export function sourceIdentity(service: ProjectService, epoch: string) {
  return service.withProject(async ({ root }) => {
    try {
      const bytes = await root.readFile('deployment.yaml');
      return { sourceHash: createHash('sha256').update(bytes).digest('hex') };
    } catch {
      // Polling never discloses filesystem paths or project contents through errors.
      return { unavailable: true as const };
    }
  }, epoch);
}
