import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { allowedUI } from './navigation.js';
import { secureWebPreferences } from './window-policy.js';
export function createDesktopWindow(uiOrigin: string, preload: string, show = true): BrowserWindow {
  if (!allowedUI(uiOrigin, uiOrigin)) throw new Error('Desktop UI requires an explicit loopback HTTP origin');
  const isolated = session.fromPartition('robopomelo-' + randomUUID());
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.setDevicePermissionHandler(() => false);
  isolated.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !allowedUI(details.url, uiOrigin) });
  });
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    show,
    webPreferences: { ...secureWebPreferences(preload), session: isolated },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!allowedUI(url, uiOrigin)) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (!allowedUI(url, uiOrigin)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('will-frame-navigate', (details) => {
    if (!details.isMainFrame || !allowedUI(details.url, uiOrigin)) details.preventDefault();
  });
  return window;
}
