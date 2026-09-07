import { ProjectService, startApplication } from '@robopomelo/application';
import { DesktopUpdater, desktopRuntimeIdentity } from './updater.js';
import { attachmentPreviewRoutes, type PreviewStore } from './preview-protocol.js';
import { NativeSetupService } from './native-setup.js';
import type { AttachmentBroker } from './attachment-broker.js';

export async function startDesktopService(options: {
  assetRoot: string;
  configDirectory: string;
  version?: string;
  previews?: PreviewStore;
  onClose?: () => Promise<void>;
  attachments?: AttachmentBroker;
}) {
  const identity = desktopRuntimeIdentity(options.version);
  const project = new ProjectService({
    toolVersion: identity.toolVersion,
    configDirectory: options.configDirectory,
  });
  let host: Awaited<ReturnType<typeof startApplication>>;
  const setup = options.attachments ? new NativeSetupService(project, options.attachments, () => host.setProjectStatus(project.status())) : undefined;
  try {
    host = await startApplication(project, new DesktopUpdater(identity), identity, options.assetRoot, {
      routes: [...(options.previews ? attachmentPreviewRoutes(options.previews) : []), ...(setup?.routes() ?? [])],
      ...(options.onClose ? { onClose: options.onClose } : {}),
    });
    return { ...host, projectEpoch: () => project.epoch, setup };
  } catch (error) {
    await project.close();
    throw error;
  }
}
