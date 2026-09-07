import type { ProjectService } from '../services/project.js';
import { startServer } from './start.js';
import { projectRoutes } from './project-routes.js';
import { reviewRoutes } from './review-routes.js';
import { evidenceRoutes } from './evidence-routes.js';
import { exportRoutes } from './export-routes.js';
import { spatialRoutes } from './spatial-routes.js';
import { simulationRoutes } from '../simulation/routes.js';
import { updateRoutes, type UpdaterApi, type RuntimeIdentity } from './update-routes.js';
import type { Route } from './contracts.js';
export async function startApplication(
  project: ProjectService,
  updater: UpdaterApi,
  identity: RuntimeIdentity,
  assetRoot: string,
  extensions: { routes?: Route[]; onClose?: () => Promise<void> } = {},
) {
  let host: Awaited<ReturnType<typeof startServer>>;
  host = await startServer({
    toolVersion: identity.toolVersion,
    assetRoot,
    routes: [
      ...projectRoutes(project, () => host.setProjectStatus(project.status())),
      ...reviewRoutes(project),
      ...evidenceRoutes(project),
      ...exportRoutes(project),
      ...spatialRoutes(project),
      ...simulationRoutes(project),
      ...updateRoutes(updater, identity),
      ...(extensions.routes ?? []),
    ],
    onClose: async () => {
      try {
        await project.close();
      } finally {
        await extensions.onClose?.();
      }
    },
  });
  host.setProjectStatus(project.status());
  return host;
}
