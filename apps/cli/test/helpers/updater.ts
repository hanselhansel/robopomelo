import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { RuntimeCache } from '../../src/runtime/cache.js';
import { PublicReleaseNetwork } from '../../src/runtime/network.js';
import { UpdateService } from '../../src/runtime/update.js';
import { loadBundledRuntime } from '../../src/runtime/bundle.js';
import { UpdatePreferences } from '../../../../packages/project-fs/src/settings/updates.js';
import { manifest, runtimeFiles } from '../../../../tests/distribution/helpers/runtime.js';
import { release, syntheticVerifier } from '../../../../tests/distribution/helpers/release.js';
import type { ProjectService } from '../../src/services/project.js';
/** Actual local package/cache I/O, explicitly synthetic publisher fixture transport. */
export async function updaterFixture(root: string, project: ProjectService, fail = false) {
  const directory = join(root, 'bundle');
  await mkdir(directory, { mode: 0o700 });
  for (const [path, body] of Object.entries({
    ...runtimeFiles(),
    'runtime-manifest.json': JSON.stringify(manifest()),
  })) {
    await mkdir(dirname(join(directory, path)), { recursive: true, mode: 0o700 });
    await writeFile(join(directory, path), body);
  }
  const bundle = await loadBundledRuntime(directory),
    cache = new RuntimeCache({ directory: join(root, 'runtime-cache'), verify: syntheticVerifier }),
    preferences = new UpdatePreferences(project.settings),
    r = await release('1.1.0'),
    requests: string[] = [];
  const network = new PublicReleaseNetwork(async (url) => {
    requests.push(url);
    if (fail)
      throw Object.assign(new Error('Synthetic transport unavailable'), { code: 'NETWORK_TEST_FAILURE' });
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
    requests,
    updater: new UpdateService({
      bundle,
      cache,
      preferences,
      network,
      probe: {
        nodeVersion: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        specVersion: '1.0.0',
        ruleSetVersion: '1.0.0',
        launcherProtocol: 1,
      },
    }),
  };
}
