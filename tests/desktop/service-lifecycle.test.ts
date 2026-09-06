import { expect, it, vi } from 'vitest';
import {
  DesktopServiceLifetime,
  type DesktopOwnedService,
  type DesktopOwnedWindow,
} from '../../apps/desktop/src/service-lifecycle.js';
import { DesktopUpdater, desktopRuntimeIdentity } from '../../apps/desktop/src/updater.js';
import { updateRoutes } from '@robopomelo/application';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixtures(events: string[] = []) {
  let closeListener: (() => void) | undefined;
  const service: DesktopOwnedService = {
    url: 'http://127.0.0.1:41000',
    bootstrapUrl: 'http://127.0.0.1:41000/#one-time-secret',
    close: vi.fn(async () => {
      events.push('service.close');
    }),
  };
  const window: DesktopOwnedWindow = {
    loadURL: vi.fn(async (url: string) => {
      events.push('window.load:' + url);
    }),
    destroy: vi.fn(() => {
      events.push('window.destroy');
    }),
    isDestroyed: vi.fn(() => false),
    onClose(listener) {
      closeListener = listener;
      return () => {
        events.push('window.close-listener.dispose');
        closeListener = undefined;
      };
    },
  };
  return { service, window, close: () => closeListener?.() };
}

it('waits for service readiness before creating and loading the owned window', async () => {
  const events: string[] = [];
  const ready = deferred<DesktopOwnedService>();
  const f = fixtures(events);
  const lifetime = new DesktopServiceLifetime({
    startService: async () => {
      events.push('service.start');
      return ready.promise;
    },
    createWindow: (origin) => {
      events.push('window.create:' + origin);
      return f.window;
    },
    registerBridge: () => {
      events.push('bridge.register');
      return () => events.push('bridge.dispose');
    },
    onWindowClose: vi.fn(),
    onError: vi.fn(),
  });

  const started = lifetime.start();
  await Promise.resolve();
  expect(events).toEqual(['service.start']);
  ready.resolve(f.service);
  await started;
  expect(events).toEqual([
    'service.start',
    'window.create:http://127.0.0.1:41000',
    'bridge.register',
    'window.load:http://127.0.0.1:41000/#one-time-secret',
  ]);
});

it('cleans the owned service after a window startup failure', async () => {
  const events: string[] = [];
  const f = fixtures(events);
  f.window.loadURL = vi.fn(async () => {
    throw new Error('renderer failed');
  });
  const lifetime = new DesktopServiceLifetime({
    startService: async () => f.service,
    createWindow: () => f.window,
    registerBridge: () => () => events.push('bridge.dispose'),
    onWindowClose: vi.fn(),
    onError: vi.fn(),
  });
  await expect(lifetime.start()).rejects.toThrow('renderer failed');
  expect(events).toEqual([
    'window.close-listener.dispose',
    'window.destroy',
    'bridge.dispose',
    'service.close',
  ]);
});

it('reports service startup failure without creating a window', async () => {
  const createWindow = vi.fn();
  const lifetime = new DesktopServiceLifetime({
    startService: async () => {
      throw new Error('bind failed');
    },
    createWindow,
    registerBridge: vi.fn(),
    onWindowClose: vi.fn(),
    onError: vi.fn(),
  });
  await expect(lifetime.start()).rejects.toThrow('bind failed');
  expect(createWindow).not.toHaveBeenCalled();
});

it('closes one owned window and service once, in order, on repeated quit', async () => {
  const events: string[] = [];
  const f = fixtures(events);
  const lifetime = new DesktopServiceLifetime({
    startService: async () => f.service,
    createWindow: () => f.window,
    registerBridge: () => () => events.push('bridge.dispose'),
    onWindowClose: vi.fn(),
    onError: vi.fn(),
  });
  await lifetime.start();
  events.length = 0;
  const first = lifetime.quit();
  const second = lifetime.quit();
  expect(second).toBe(first);
  await Promise.all([first, second]);
  expect(events).toEqual([
    'window.close-listener.dispose',
    'window.destroy',
    'bridge.dispose',
    'service.close',
  ]);
  expect(f.service.close).toHaveBeenCalledTimes(1);
});

it('routes a user window close through awaited lifetime cleanup', async () => {
  const f = fixtures();
  const finished = deferred<void>();
  const onWindowClose = vi.fn(() => finished.resolve());
  const lifetime = new DesktopServiceLifetime({
    startService: async () => f.service,
    createWindow: () => f.window,
    registerBridge: () => () => {},
    onWindowClose,
    onError: vi.fn(),
  });
  await lifetime.start();
  f.close();
  await finished.promise;
  expect(f.service.close).toHaveBeenCalledTimes(1);
  expect(onWindowClose).toHaveBeenCalledTimes(1);
});

it('exposes truthful disabled desktop update capabilities without a CLI runtime updater', async () => {
  const identity = desktopRuntimeIdentity();
  const updater = new DesktopUpdater(identity);
  const status = await updater.status();
  expect(identity).toMatchObject({
    toolVersion: '0.0.0-development',
    launcherVersion: '0.0.0-development',
    bundledRuntimeVersion: '0.0.0-development',
    sourceCheckout: true,
  });
  expect(status).toMatchObject({
    selection: { version: identity.toolVersion, reason: 'desktop-development-build' },
    policy: { mode: 'off', offline: false },
    compatibility: 'Desktop app updates are unavailable in this development build.',
  });
  await expect(updater.install()).rejects.toMatchObject({ code: 'DESKTOP_UPDATE_UNAVAILABLE' });
  await expect(updater.check()).rejects.toMatchObject({ code: 'DESKTOP_UPDATE_UNAVAILABLE' });
});

it('does not create a late window when quit occurs during service startup', async () => {
  const ready = deferred<DesktopOwnedService>();
  const f = fixtures();
  const createWindow = vi.fn(() => f.window);
  const lifetime = new DesktopServiceLifetime({ startService: () => ready.promise,
    createWindow, registerBridge: () => () => {}, onWindowClose: vi.fn(), onError: vi.fn() });
  const start = lifetime.start();
  expect(lifetime.start()).toBe(start);
  const quit = lifetime.quit();
  ready.resolve(f.service);
  await Promise.all([start, quit]);
  expect(createWindow).not.toHaveBeenCalled();
  expect(f.service.close).toHaveBeenCalledTimes(1);
});

it('continues service cleanup after a failing bridge disposer', async () => {
  const f = fixtures();
  const lifetime = new DesktopServiceLifetime({ startService: async () => f.service,
    createWindow: () => f.window, registerBridge: () => () => { throw new Error('dispose failed'); },
    onWindowClose: vi.fn(), onError: vi.fn() });
  await lifetime.start();
  await expect(lifetime.quit()).rejects.toThrow('Desktop shutdown failed');
  expect(f.service.close).toHaveBeenCalledTimes(1);
});

it('does not advertise updater eligibility or verified compatibility for a desktop development build', async () => {
  const identity = desktopRuntimeIdentity();
  const route = updateRoutes(new DesktopUpdater(identity), identity).find(r => r.method === 'GET');
  const status = await route!.handler({} as never);
  expect(status).toMatchObject({
    compatibility: 'Desktop app updates are unavailable in this development build.',
    checkEligible: false, installEligible: false, rollbackEligible: false,
  });
});
