import { app, type BrowserWindow, type Event } from 'electron';
import { join } from 'node:path';
import { createDesktopWindow } from './window.js';
import { registerNativeBridge } from './native-registration.js';
import { startDesktopService } from './application-service.js';
import { DesktopServiceLifetime } from './service-lifecycle.js';

let ownedWindow: BrowserWindow | undefined;
let quitReady = false;
function fail(error: unknown) {
  console.error(error instanceof Error ? error.message : 'Desktop failed');
  app.exit(1);
}
export const lifetime = new DesktopServiceLifetime({
  async startService() {
    await app.whenReady();
    return startDesktopService({
      assetRoot: join(__dirname, 'ui'),
      configDirectory: join(app.getPath('userData'), 'settings'),
    });
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
    return registerNativeBridge(ownedWindow, service.url, {
      async confirm() {
        throw new Error('Project permission persistence is not connected yet.');
      },
      async cancelRun() {
        throw new Error('Application run management is not connected yet.');
      },
    });
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
