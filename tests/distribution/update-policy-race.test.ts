import { it, expect } from 'vitest';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore } from '../../packages/project-fs/src/settings/store.js';
import { UpdatePreferences } from '../../packages/project-fs/src/settings/updates.js';
import { RuntimeCache } from '../../apps/cli/src/runtime/cache.js';
import { UpdateService } from '../../apps/cli/src/runtime/update.js';
import { PublicReleaseNetwork } from '../../apps/cli/src/runtime/network.js';
import { manifest, probe } from './helpers/runtime.js';
import { release, syntheticVerifier } from './helpers/release.js';

it('refuses promotion when settings change while a release is being verified', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'rp-policy-race-')));
  try {
    const preferences = new UpdatePreferences(new SettingsStore(join(directory, 'config')));
    const candidate = await release('1.1.0');
    let changed = false;
    const cache = new RuntimeCache({
      directory: join(directory, 'cache'),
      verify: async (...args) => {
        const verified = await syntheticVerifier(...args);
        if (!changed) {
          changed = true;
          await preferences.configure({ mode: 'off' }, { scopes: ['manage-settings'] });
        }
        return verified;
      },
    });
    const network = new PublicReleaseNetwork(async (url) => {
      if (url.endsWith('.tgz')) return new Response(new Uint8Array(candidate.bytes));
      if (url.includes('/attestations/')) return Response.json(candidate.attestations);
      return Response.json({
        name: 'robopomelo',
        version: candidate.metadata.version,
        dist: {
          integrity: candidate.metadata.integrity,
          tarball: candidate.metadata.tarball,
          attestations: { url: candidate.metadata.attestations },
        },
      });
    });
    const service = new UpdateService({
      bundle: {
        directory: join(directory, 'bundle'),
        source: 'bundle',
        manifest: manifest(),
        manifestDigest: 'a'.repeat(64),
      },
      cache,
      preferences,
      network,
      probe: probe(),
    });
    const before = await cache.pointer();
    await expect(service.install({ version: '1.1.0' })).rejects.toMatchObject({ code: 'POLICY_CHANGED' });
    expect(changed).toBe(true);
    expect((await preferences.read()).mode).toBe('off');
    expect(await cache.pointer()).toEqual(before);
    expect((await service.status()).selection).toEqual({ version: '1.0.0', reason: 'bundle' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
