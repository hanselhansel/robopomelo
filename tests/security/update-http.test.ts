import { it, expect } from 'vitest';
import { updateRoutes } from '../../apps/cli/src/server/update-routes.js';
import { appFixture } from './helpers/app.js';
it('maps update identity and explicit settings through the authenticated API', async () => {
  let configured: unknown;
  let resumed = 0;
  const updater = {
    status: async () => ({
      policy: { mode: 'auto', pinnedVersion: null, rollbackHold: null, offline: false },
      selection: { version: '1.1.0', reason: 'cache' },
      runtime: { manifest: { version: '1.1.0' } },
      lastOutcome: null,
    }),
    configure: async (value: unknown) => {
      configured = value;
      return value;
    },
    resume: async () => {
      resumed++;
      return {};
    },
    check: async () => ({ status: 'current' }),
    install: async () => ({ status: 'installed' }),
    rollback: async () => ({ status: 'rolled-back' }),
  };
  const app = await appFixture(() =>
    updateRoutes(updater, {
      toolVersion: '1.1.0',
      launcherVersion: '1.0.0',
      bundledRuntimeVersion: '1.0.0',
      sourceCheckout: true,
    }),
  );
  try {
    const status = await app.call('/api/updates');
    expect(status.body.data.versions.launcherVersion).toBe('1.0.0');
    expect(status.body.data.versions.currentRuntimeVersion).toBe('1.1.0');
    expect((await app.call('/api/updates/configure', { mode: 'off', pin: null })).status).toBe(200);
    expect(configured).toEqual({ mode: 'off', pinnedVersion: null });
    expect((await app.call('/api/updates/configure', { resume: true, mode: 'auto' })).status).toBe(400);
    expect(resumed).toBe(0);
  } finally {
    await app.close();
  }
});
