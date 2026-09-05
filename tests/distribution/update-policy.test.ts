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
import { UpdateService } from '../../apps/cli/src/runtime/update.js';
import { RuntimeCache } from '../../apps/cli/src/runtime/cache.js';
import { PublicReleaseNetwork } from '../../apps/cli/src/runtime/network.js';
import { loadBundledRuntime } from '../../apps/cli/src/runtime/bundle.js';
import { release, syntheticVerifier } from './helpers/release.js';
import { manifest, runtimeFiles, probe } from './helpers/runtime.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
async function service(latest = '1.1.0') {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'rp-service-')));
  roots.push(directory);
  const bundleDir = join(directory, 'bundle');
  await mkdir(bundleDir, { mode: 0o700 });
  for (const [file, body] of Object.entries({
    ...runtimeFiles(),
    'runtime-manifest.json': JSON.stringify(manifest()),
  })) {
    await mkdir(dirname(join(bundleDir, file)), { recursive: true, mode: 0o700 });
    await writeFile(join(bundleDir, file), body);
  }
  const bundle = await loadBundledRuntime(bundleDir),
    cache = new RuntimeCache({ directory: join(directory, 'cache'), verify: syntheticVerifier }),
    preferences = new UpdatePreferences(new SettingsStore(join(directory, 'config')));
  const releases = await Promise.all(['1.0.0', '1.1.0', '2.0.0'].map((v) => release(v)));
  const requests: string[] = [];
  const network = new PublicReleaseNetwork(async (url) => {
    requests.push(url);
    const version = url.endsWith('/latest')
      ? latest
      : releases.find((r) => url.includes(r.metadata.version))?.metadata.version;
    const r = releases.find((r) => r.metadata.version === version)!;
    if (url.endsWith('.tgz')) return new Response(new Uint8Array(r.bytes));
    if (url.includes('/attestations/')) return Response.json(r.attestations);
    return Response.json({
      name: 'robopomelo',
      version: r.metadata.version,
      dist: {
        integrity: r.metadata.integrity,
        tarball: r.metadata.tarball,
        attestations: { url: r.metadata.attestations },
      },
    });
  });
  return {
    directory,
    bundle,
    cache,
    preferences,
    requests,
    network,
    service: new UpdateService({ bundle, cache, preferences, network, probe: probe() }),
  };
}
it('automatically verifies and selects a newer compatible stable runtime between launches', async () => {
  const host = await service();
  const status = await host.service.startup({});
  expect(status.runtime.manifest.version).toBe('1.1.0');
  expect(status.selection.reason).toBe('cache');
  expect(host.requests.every((r) => r.startsWith('https://registry.npmjs.org/'))).toBe(true);
});
it('notify mode checks only metadata and never stages or promotes a package', async () => {
  const host = await service();
  await host.preferences.configure({ mode: 'notify' }, authority);
  const status = await host.service.startup({});
  expect(status.runtime.manifest.version).toBe('1.0.0');
  expect(host.requests).toHaveLength(1);
  expect((await host.cache.pointer()).active).toBeNull();
  expect(status.lastOutcome?.pendingVersion).toBe('1.1.0');
});
it('offline, exact pin, hold, source checkout and read-only startup make zero update requests', async () => {
  for (const run of [
    { offline: true },
    { readOnly: true },
    { sourceCheckout: true },
    { explicitVersion: '1.0.0' },
  ]) {
    const host = await service();
    await host.service.startup(run);
    expect(host.requests).toEqual([]);
  }
  const host = await service();
  await host.preferences.configure({ pinnedVersion: '1.0.0' }, authority);
  await host.service.startup({});
  expect(host.requests).toEqual([]);
  expect((await host.service.check({ offline: true })).status).toBe('not-checked');
  await expect(host.service.install({ version: '1.1.0', offline: true })).rejects.toThrow();
  expect(host.requests).toEqual([]);
});
it('explicit installation cannot silently clear a conflicting pin or rollback hold', async () => {
  const host = await service();
  await host.preferences.configure({ pinnedVersion: '1.0.0' }, authority);
  await expect(host.service.install({ version: '1.1.0' })).rejects.toMatchObject({ code: 'POLICY_CONFLICT' });
  expect(host.requests).toEqual([]);
  expect((await host.preferences.read()).pinnedVersion).toBe('1.0.0');
});
it('rollback survives a new service instance and resume releases its hold', async () => {
  const host = await service();
  await host.service.install({ version: '1.1.0' });
  await host.service.rollback({}, authority);
  const next = new UpdateService({
    bundle: host.bundle,
    cache: host.cache,
    preferences: host.preferences,
    network: host.network,
    probe: probe(),
  });
  const count = host.requests.length;
  expect((await next.startup({})).runtime.manifest.version).toBe('1.0.0');
  expect(host.requests).toHaveLength(count);
  await next.resume(authority);
  expect((await next.startup({})).runtime.manifest.version).toBe('1.1.0');
});
it('automatic policy does not select a new major while explicit verified install can', async () => {
  const host = await service('2.0.0');
  expect((await host.service.startup({})).runtime.manifest.version).toBe('1.0.0');
  expect((await host.cache.pointer()).active).toBeNull();
  expect((await host.service.install({ version: '2.0.0' })).version).toBe('2.0.0');
});
it('a bounded startup timeout leaves the original exact runtime selected', async () => {
  const host = await service();
  const network = new PublicReleaseNetwork(
    async (_url, signal) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
  );
  const updater = new UpdateService({
    bundle: host.bundle,
    cache: host.cache,
    preferences: host.preferences,
    network,
    probe: probe(),
    startupTimeoutMs: 10,
  });
  expect((await updater.startup({})).runtime.manifest.version).toBe('1.0.0');
  expect((await host.cache.pointer()).active).toBeNull();
});
it('help/version-style startup leaves an absent machine cache absent', async () => {
  const host = await service();
  await host.service.startup({ readOnly: true });
  await expect(stat(join(host.directory, 'cache'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(stat(join(host.directory, 'config'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('reports the actual cache source when cached and bundled versions have equal labels', async () => {
  const host = await service();
  await host.service.install({ version: '1.0.0' });
  const status = await host.service.status();
  expect(status.selection.reason).toBe('cache');
  expect(status.runtime.source).toBe('cache');
});
it('mode off suppresses automatic checks but explicit manual checks remain available', async () => {
  const host = await service();
  await host.preferences.configure({ mode: 'off' }, authority);
  await host.service.startup({});
  expect(host.requests).toEqual([]);
  expect((await host.service.check()).status).toBe('available');
  expect(host.requests).toHaveLength(1);
});
import { stat } from 'node:fs/promises';
it('allows explicit installation of the exact pin when it is not cached yet', async () => {
  const host = await service();
  await host.preferences.configure({ pinnedVersion: '1.1.0' }, authority);
  expect((await host.service.install({ version: '1.1.0' })).version).toBe('1.1.0');
  expect((await host.service.startup({})).selection).toEqual({ version: '1.1.0', reason: 'pin' });
});
