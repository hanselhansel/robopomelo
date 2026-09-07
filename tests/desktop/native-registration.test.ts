import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
vi.mock('electron', () => ({
  dialog: {},
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));
import { registerNativeBridge } from '../../apps/desktop/src/native-registration.js';
it('retains selections for in-page navigation but invalidates document replacement', () => {
  const contents = Object.assign(new EventEmitter(), { id: 1, mainFrame: {}, isDestroyed: () => false });
  const window = Object.assign(new EventEmitter(), { webContents: contents });
  const clear = vi.fn();
  const dispose = registerNativeBridge(
    window as unknown as BrowserWindow,
    'http://127.0.0.1:3000',
    {
      confirm: async () => {},
      cancelRun: async () => {},
    },
    {
      contextKey: () => '0',
      select: async () => [],
      inspect: async () => {
        throw new Error('No selection');
      },
      cancel: () => {},
      clear,
    },
  );
  contents.emit('did-start-navigation', {}, 'http://127.0.0.1:3000/#review', true, true);
  expect(clear).not.toHaveBeenCalled();
  contents.emit('did-start-navigation', {}, 'http://127.0.0.1:3000/', false, true);
  expect(clear).toHaveBeenCalledTimes(1);
  dispose();
});
it('cleans native handlers after BrowserWindow has destroyed its webContents accessor', () => {
  const contents = Object.assign(new EventEmitter(), { id: 1, mainFrame: {}, isDestroyed: () => false });
  const window = new EventEmitter();
  let destroyed = false;
  Object.defineProperty(window, 'webContents', {
    get: () => {
      if (destroyed) throw new Error('Object has been destroyed');
      return contents;
    },
  });
  registerNativeBridge(
    window as BrowserWindow,
    'http://127.0.0.1:3000',
    {
      confirm: async () => {},
      cancelRun: async () => {},
    },
    {
      contextKey: () => '0',
      select: async () => [],
      inspect: async () => {
        throw new Error('No selection');
      },
      cancel: () => {},
      clear: () => {},
    },
  );
  destroyed = true;
  expect(() => window.emit('closed')).not.toThrow();
  expect(contents.listenerCount('did-start-navigation')).toBe(0);
});
