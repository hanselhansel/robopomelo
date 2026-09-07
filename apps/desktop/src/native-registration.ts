import { dialog, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { realpath, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { channels } from './native-contracts.js';
import { createNativeHandlers } from './native-dialogs.js';
import type { NativeDependencies } from './native-dialogs.js';
export function registerNativeBridge(
  window: BrowserWindow,
  uiOrigin: string,
  callbacks: Pick<NativeDependencies, 'confirm' | 'cancelRun'>,
  attachments: NativeDependencies['attachments'],
) {
  const contents = window.webContents;
  const handlers = createNativeHandlers({
    sender: contents,
    uiOrigin,
    ...callbacks,
    attachments,
    async identity(path) {
      const resolved = await realpath(path),
        info = await stat(resolved, { bigint: true });
      return {
        identity: resolved + ':' + info.dev + ':' + info.ino + ':' + info.birthtimeNs,
        name: basename(resolved),
        bytes: Number(info.size),
        directory: info.isDirectory(),
      };
    },
    dialogs: {
      async chooseFolder(mode) {
        const result = await dialog.showOpenDialog(window, {
          title: mode === 'create' ? 'Choose a folder for your project' : 'Open project folder',
          properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      async chooseFiles() {
        const result = await dialog.showOpenDialog(window, {
          title: 'Select project attachments',
          properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
        });
        return result.canceled ? [] : result.filePaths;
      },
      async confirmPreset(path, preset) {
        const result = await dialog.showMessageBox(window, {
          type: 'question',
          buttons: ['Cancel', 'Confirm'],
          defaultId: 0,
          cancelId: 0,
          message: 'Confirm project setup',
          detail:
            'Folder: ' +
            path +
            '\nPreset: ' +
            preset +
            (preset === 'recommended'
              ? '\nRecommended enables connected AI and public research when configured.'
              : '\nInspection keeps connected AI and public research disabled.'),
          noLink: true,
        });
        return result.response === 1;
      },
    },
  });
  for (const method of [
    'chooseProjectFolder',
    'selectAttachments',
    'inspectAttachment',
    'cancelAttachment',
    'confirmSetup',
    'cancelRun',
  ] as const) {
    ipcMain.handle(channels[method], async (event, ...args: unknown[]) => {
      const count = method === 'selectAttachments' ? 0 : method === 'confirmSetup' ? 2 : 1;
      if (args.length !== count) throw new Error('Invalid native argument count');
      switch (method) {
        case 'chooseProjectFolder':
          return handlers.chooseProjectFolder(event, args[0]);
        case 'selectAttachments':
          return handlers.selectAttachments(event);
        case 'inspectAttachment':
          return handlers.inspectAttachment(event, args[0]);
        case 'cancelAttachment':
          return handlers.cancelAttachment(event, args[0]);
        case 'confirmSetup':
          return handlers.confirmSetup(event, args[0], args[1]);
        case 'cancelRun':
          return handlers.cancelRun(event, args[0]);
      }
    });
  }
  const invalidate = (_event: unknown, _url: string, isInPlace: boolean, isMainFrame: boolean) => {
    if (isMainFrame && !isInPlace) handlers.dispose();
  };
  contents.on('did-start-navigation', invalidate);
  const dispose = () => {
    contents.removeListener('did-start-navigation', invalidate);
    handlers.dispose();
    for (const channel of Object.values(channels)) ipcMain.removeHandler(channel);
  };
  window.once('closed', dispose);
  return dispose;
}
