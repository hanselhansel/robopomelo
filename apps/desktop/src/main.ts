import { app, type BrowserWindow, type Event } from 'electron';
import { join } from 'node:path';
import { createDesktopWindow } from './window.js';
import { registerNativeBridge } from './native-registration.js';
import { startDesktopService } from './application-service.js';
import { DesktopServiceLifetime } from './service-lifecycle.js';
import { AttachmentBroker } from './attachment-broker.js';
import { PreviewStore } from './preview-protocol.js';
import { parseAttachment, registerParserScheme } from './parser-window.js';

registerParserScheme();
let application: Awaited<ReturnType<typeof startDesktopService>> | undefined;
const previews = new PreviewStore();
const attachments = new AttachmentBroker({
  context: () => application?.projectEpoch() ?? '0',
  previews,
  parse: (input, signal) =>
    parseAttachment(input, {
      assetRoot: join(__dirname, 'parser'),
      preload: join(__dirname, 'parser-preload.cjs'),
      signal,
    }),
});

let ownedWindow: BrowserWindow | undefined;
let quitReady = false;
function fail(error: unknown) {
  console.error(error instanceof Error ? error.message : 'Desktop failed');
  app.exit(1);
}
export const lifetime = new DesktopServiceLifetime({
  async startService() {
    await app.whenReady();
    application = await startDesktopService({
      assetRoot: join(__dirname, 'ui'),
      configDirectory: join(app.getPath('userData'), 'settings'),
      previews,
      attachments,
      onClose: () => attachments.close(),
    });
    return application;
  },
  createWindow(origin) {
    const window = createDesktopWindow(origin, join(__dirname, 'preload.cjs'));
    ownedWindow = window;
    return {
      loadURL: (url) => window.loadURL(url),
      destroy: () => window.destroy(),
      isDestroyed: () => window.isDestroyed(),
      onClose(listener) {
        const close = (event: Event) => {
          event.preventDefault();
          listener();
        };
        window.on('close', close);
        return () => window.removeListener('close', close);
      },
    };
  },
  registerBridge(_window, service) {
    if (!ownedWindow) throw new Error('Desktop window is unavailable');
    return registerNativeBridge(
      ownedWindow,
      service.url,
      {
        async previewSetup(path, preset, mode) {
          if (!application?.setup) throw new Error('Project setup is unavailable.');
          return application.setup.preview(path, preset, mode);
        },
        async confirm(path, preset, mode, revision) {
          if (!application?.setup) throw new Error('Project setup is unavailable.');
          await application.setup.confirm(path, preset, mode, revision);
        },
        async cancelRun() {
          throw new Error('Application run management is not connected yet.');
        },
      },
      attachments,
    );
  },
  onWindowClose: () => app.quit(),
  onError: fail,
});
// Window destruction during cleanup must not bypass awaited service shutdown.
app.on('window-all-closed', () => {});
app.on('before-quit', (event) => {
  if (quitReady) return;
  event.preventDefault();
  void lifetime.quit().then(() => {
    quitReady = true;
    app.quit();
  }, fail);
});
export const started = lifetime.start();
void started.catch(fail);
