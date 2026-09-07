import { ProjectService, startApplication } from '@robopomelo/application';
import { DesktopUpdater, desktopRuntimeIdentity } from './updater.js';

export async function startDesktopService(options: {
  assetRoot: string;
  configDirectory: string;
  version?: string;
}) {
  const identity = desktopRuntimeIdentity(options.version);
  const project = new ProjectService({
    toolVersion: identity.toolVersion,
    configDirectory: options.configDirectory,
  });
  try {
    return await startApplication(project, new DesktopUpdater(identity), identity, options.assetRoot);
  } catch (error) {
    await project.close();
    throw error;
  }
}
