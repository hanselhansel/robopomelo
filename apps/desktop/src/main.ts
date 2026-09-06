import { app } from 'electron';
import { join } from 'node:path';
import { createDesktopWindow } from './window.js';
import { registerNativeBridge } from './native-registration.js';
// D2 supplies the shared service lifetime. Until then an explicit existing local
// service can exercise the real web UI; no alternative product renderer is built.
async function main() {
  await app.whenReady();
  const origin = process.env.ROBOPOMELO_DESKTOP_UI_ORIGIN;
  if (!origin)
    throw new Error(
      'Shared application service is not connected. Set ROBOPOMELO_DESKTOP_UI_ORIGIN to an explicitly started local service.',
    );
  const window = createDesktopWindow(origin, join(__dirname, 'preload.cjs'));
  registerNativeBridge(window, origin, {
    async confirm() {
      throw new Error('Project permission persistence is not connected yet.');
    },
    async cancelRun() {
      throw new Error('Application run management is not connected yet.');
    },
  });
  await window.loadURL(origin);
}
app.on('window-all-closed', () => app.quit());
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Desktop startup failed');
  app.exit(1);
});
