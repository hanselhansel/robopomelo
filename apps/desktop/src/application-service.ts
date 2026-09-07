import { ProjectService, startApplication } from '@robopomelo/application';
import { DesktopUpdater, desktopRuntimeIdentity } from './updater.js';
import { attachmentPreviewRoutes, type PreviewStore } from './preview-protocol.js';

export async function startDesktopService(options: {
  assetRoot: string;
  configDirectory: string;
  version?: string;
  previews?: PreviewStore;
  onClose?: () => Promise<void>;
}) {
  const identity = desktopRuntimeIdentity(options.version);
  const project = new ProjectService({
    toolVersion: identity.toolVersion,
    configDirectory: options.configDirectory,
  });
  try {
    const host = await startApplication(project, new DesktopUpdater(identity), identity, options.assetRoot, {
      ...(options.previews ? { routes: attachmentPreviewRoutes(options.previews) } : {}),
      ...(options.onClose ? { onClose: options.onClose } : {}),
    });
    return { ...host, projectEpoch: () => project.epoch };
  } catch (error) {
    await project.close();
    throw error;
  }
}
