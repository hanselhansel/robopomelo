import type { ProjectService } from '../services/project.js';
import { startServer } from './start.js';
import { projectRoutes } from './project-routes.js';
import { reviewRoutes } from './review-routes.js';
import { evidenceRoutes } from './evidence-routes.js';
import { exportRoutes } from './export-routes.js';
import { updateRoutes, type UpdaterApi, type RuntimeIdentity } from './update-routes.js';
export async function startApplication(
  project: ProjectService,
  updater: UpdaterApi,
  identity: RuntimeIdentity,
  assetRoot: string,
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
      ...updateRoutes(updater, identity),
    ],
    onClose: () => project.close(),
  });
  host.setProjectStatus(project.status());
  return host;
}
