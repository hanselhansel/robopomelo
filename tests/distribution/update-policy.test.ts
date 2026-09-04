import { afterEach, expect, it } from 'vitest';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore } from '../../packages/project-fs/src/settings/store.js';
import { UpdatePreferences } from '../../packages/project-fs/src/settings/updates.js';
import { defaultSettings } from '../../packages/project-fs/src/settings/schema.js';
import { selectRuntime, effectivePolicy } from '../../apps/cli/src/runtime/selection.js';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
const authority = { scopes: ['manage-settings'] as const };
async function preferences() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'rp-policy-')));
  roots.push(root);
  return new UpdatePreferences(new SettingsStore(join(root, 'config')));
}
it('defaults to automatic stable updates and keeps per-run overrides transient', () => {
  const settings = defaultSettings().updates;
  expect(settings.mode).toBe('auto');
  expect(effectivePolicy(settings, { offline: true, mode: 'notify' })).toMatchObject({
    offline: true,
    mode: 'notify',
  });
  expect(settings).toMatchObject({ offline: false, mode: 'auto' });
});
it('selects explicit version, hold, pin, selected cache and bundle in exact order', () => {
  const policy = defaultSettings().updates;
  expect(
    selectRuntime(policy, { explicitVersion: '1.2.0' }, ['1.0.0', '1.1.0', '1.2.0'], '1.0.0', '1.1.0'),
  ).toEqual({ version: '1.2.0', reason: 'explicit' });
  policy.pinnedVersion = '1.0.0';
  policy.rollbackHold = {
    version: '1.1.0',
    previousVersion: '1.2.0',
    priorPolicy: { mode: 'auto', offline: false, pinnedVersion: '1.0.0', skippedVersions: [] },
    policyGeneration: 0,
  };
  expect(selectRuntime(policy, {}, ['1.0.0', '1.1.0'], '1.0.0', '1.1.0').reason).toBe('rollback-hold');
  policy.rollbackHold = null;
  expect(selectRuntime(policy, {}, ['1.0.0', '1.1.0'], '1.0.0', '1.1.0').reason).toBe('pin');
  policy.pinnedVersion = null;
  expect(selectRuntime(policy, {}, ['1.1.0'], '1.0.0', '1.1.0').reason).toBe('cache');
  expect(selectRuntime(policy, {}, [], '1.0.0', null).reason).toBe('bundle');
});
it('fails an unavailable explicit version instead of silently using another runtime', () => {
  expect(() =>
    selectRuntime(
      defaultSettings().updates,
      { explicitVersion: '2.0.0', offline: true },
      ['1.0.0'],
      '1.0.0',
      null,
    ),
  ).toThrow(expect.objectContaining({ code: 'RUNTIME_UNAVAILABLE' }));
});
it('persists rollback hold across reads and resumes the prior pin and policy', async () => {
  const p = await preferences();
  await p.configure({ mode: 'notify', pinnedVersion: '1.1.0' }, authority);
  await p.hold('1.0.0', '1.1.0', authority);
  expect((await p.read()).rollbackHold?.version).toBe('1.0.0');
  expect((await p.read()).pinnedVersion).toBe('1.1.0');
  expect(await p.resume(authority)).toMatchObject({
    mode: 'notify',
    pinnedVersion: '1.1.0',
    rollbackHold: null,
  });
});
it('resume preserves deliberate policy edits made during a rollback hold', async () => {
  const p = await preferences();
  await p.hold('1.0.0', '1.1.0', authority);
  await p.configure({ mode: 'off', offline: true }, authority);
  expect(await p.resume(authority)).toMatchObject({ mode: 'off', offline: true, rollbackHold: null });
});
it('accepts exact candidate pins, rejects floating versions and requires settings authority', async () => {
  const p = await preferences();
  expect(await p.configure({ pinnedVersion: '1.0.0-rc.1' }, authority)).toMatchObject({
    pinnedVersion: '1.0.0-rc.1',
  });
  await expect(p.configure({ pinnedVersion: 'latest' }, authority)).rejects.toMatchObject({
    code: 'SETTINGS_INVALID',
  });
  await expect(p.configure({ mode: 'off' }, { scopes: ['author'] })).rejects.toMatchObject({
    code: 'SCOPE_DENIED',
  });
});
