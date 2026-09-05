// Regression: ISSUE-003, the browser offline preference was ignored by the API.
// Found by /qa on 2026-09-05. Report: .gstack/qa-reports/qa-report-robopomelo-2026-09-05.md
import { it, expect } from 'vitest';
import { updateRoutes, type UpdaterApi } from '../../apps/cli/src/server/update-routes.js';
import type { UpdateService } from '../../apps/cli/src/runtime/update.js';
import { updaterFixture } from '../../apps/cli/test/helpers/updater.js';
import { appFixture } from './helpers/app.js';
it('persists explicit offline booleans while an offline invocation remains enforced', async () => {
  let updater: UpdateService;
  const proxy: UpdaterApi = {
    status: (r) => updater.status(r),
    configure: (v, a) => updater.configure(v, a),
    resume: (a) => updater.resume(a),
    check: (r) => updater.check(r),
    install: (r) => updater.install(r),
    rollback: (r, a) => updater.rollback(r, a),
  };
  const app = await appFixture(() =>
    updateRoutes(proxy, {
      toolVersion: '1.0.0',
      launcherVersion: '1.0.0',
      bundledRuntimeVersion: '1.0.0',
      offline: true,
    }),
  );
  try {
    const fixture = await updaterFixture(app.temp, app.service);
    updater = fixture.updater;
    expect((await app.call('/api/updates/configure', { offline: true })).status).toBe(200);
    expect((await app.service.settings.read()).updates.offline).toBe(true);
    expect((await app.call('/api/updates/configure', { offline: false })).status).toBe(200);
    expect((await app.service.settings.read()).updates.offline).toBe(false);
    const status = (await app.call('/api/updates')).body.data;
    expect(status).toMatchObject({
      offline: true,
      configuredOffline: false,
      offlineForced: true,
      installEligible: false,
      rollbackEligible: false,
    });
    expect(status.versions.currentRuntimeVersion).toBe('1.0.0');
    expect((await app.call('/api/updates/check', {})).body.data.status).toBe('not-checked');
    expect(fixture.requests).toEqual([]);
    expect((await app.call('/api/updates/configure', { offline: 'yes' })).status).toBe(400);
  } finally {
    await app.close();
  }
});
it('preserves a typed unavailable-pin error through the HTTP boundary', async () => {
  let updater: UpdateService;
  const proxy: UpdaterApi = {
    status: (r) => updater.status(r),
    configure: (v, a) => updater.configure(v, a),
    resume: (a) => updater.resume(a),
    check: (r) => updater.check(r),
    install: (r) => updater.install(r),
    rollback: (r, a) => updater.rollback(r, a),
  };
  const app = await appFixture(() =>
    updateRoutes(proxy, { toolVersion: '1.0.0', launcherVersion: '1.0.0', bundledRuntimeVersion: '1.0.0' }),
  );
  try {
    updater = (await updaterFixture(app.temp, app.service)).updater;
    expect((await app.call('/api/updates/configure', { pin: '9.9.9' })).status).toBe(200);
    const result = await app.call('/api/updates');
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('RUNTIME_UNAVAILABLE');
    expect(result.body.error.message).toContain('exact requested runtime');
    expect(result.body.error).not.toHaveProperty('stack');
  } finally {
    await app.close();
  }
});
it('reports a verified staged runtime separately from the still-running version', async () => {
  let updater: UpdateService;
  const proxy: UpdaterApi = {
    status: (r) => updater.status(r),
    configure: (v, a) => updater.configure(v, a),
    resume: (a) => updater.resume(a),
    check: (r) => updater.check(r),
    install: (r) => updater.install(r),
    rollback: (r, a) => updater.rollback(r, a),
  };
  const app = await appFixture(() =>
    updateRoutes(proxy, { toolVersion: '1.0.0', launcherVersion: '1.0.0', bundledRuntimeVersion: '1.0.0' }),
  );
  try {
    updater = (await updaterFixture(app.temp, app.service)).updater;
    await updater.install({ version: '1.1.0' });
    const status = (await app.call('/api/updates')).body.data;
    expect(status).toMatchObject({
      pendingVersion: '1.1.0',
      installEligible: false,
      rollbackEligible: true,
      rollbackVersion: '1.0.0',
      versions: { currentRuntimeVersion: '1.0.0', selectedRuntimeVersion: '1.1.0' },
    });
  } finally {
    await app.close();
  }
});
