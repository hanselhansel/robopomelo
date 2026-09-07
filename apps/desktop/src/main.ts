import { app, safeStorage, shell, type BrowserWindow, type Event } from 'electron';
import { OAuthLoopbackFlow, fetchTransport } from '@robopomelo/application';
import { CredentialStore } from './credential-store.js';
import { createMacOSEncryptionProvider } from './credential-encryption.js';
import { ConnectionManager } from './connections.js';
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
let connections: ConnectionManager | undefined;
let credentials: CredentialStore | undefined;
/** Only the exact OpenRouter sign-in origin may be opened in the system browser. */
async function openSignIn(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://openrouter.ai' || parsed.pathname !== '/auth' || parsed.username || parsed.password || parsed.hash)
    throw new Error('Refusing to open an unexpected sign-in destination.');
  await shell.openExternal(parsed.toString());
}
let quitReady = false;
function fail(error: unknown) {
  console.error(error instanceof Error ? error.message : 'Desktop failed');
  app.exit(1);
}
export const lifetime = new DesktopServiceLifetime({
  async startService() {
    await app.whenReady();
    credentials = await CredentialStore.open(join(app.getPath('userData'), 'credentials'), createMacOSEncryptionProvider(safeStorage));
    connections = new ConnectionManager(credentials, new OAuthLoopbackFlow({ transport: fetchTransport, openExternal: openSignIn }));
    application = await startDesktopService({
      assetRoot: join(__dirname, 'ui'),
      configDirectory: join(app.getPath('userData'), 'settings'),
      previews,
      attachments,
      connections,
      onClose: async () => {
        try { await connections?.close(); await credentials?.close(); } finally { await attachments.close(); }
      },
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
          throw new Error('Cancel runs from the conversation panel.');
        },
        connections: {
          connect: (route) => { if (!connections) throw new Error('Connections are unavailable.'); return connections.connect(route); },
          statuses: () => { if (!connections) throw new Error('Connections are unavailable.'); return connections.statuses(); },
          status: (id) => { if (!connections) throw new Error('Connections are unavailable.'); return connections.status(id); },
          disconnect: (id) => { if (!connections) throw new Error('Connections are unavailable.'); return connections.disconnect(id); },
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
