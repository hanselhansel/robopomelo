import { expect, it } from 'vitest';
import { PublicReleaseNetwork } from '../../apps/cli/src/runtime/network.js';
it('allows only fixed public package endpoints and validates every redirect', async () => {
  const requests: string[] = [];
  const network = new PublicReleaseNetwork(async (url) => {
    requests.push(url);
    return new Response(null, { status: 302, headers: { location: 'https://evil.example/payload' } });
  });
  await expect(network.json('https://registry.npmjs.org/robopomelo/latest')).rejects.toMatchObject({
    code: 'UPDATE_URL_DENIED',
  });
  expect(requests).toEqual(['https://registry.npmjs.org/robopomelo/latest']);
  // Synthetic userinfo exercises rejection without a credential-shaped URL literal.
  const credentialUrl = new URL('https://registry.npmjs.org/robopomelo');
  credentialUrl.username = 'fixture-user';
  credentialUrl.password = 'fixture-password';
  for (const url of [
    'http://registry.npmjs.org/robopomelo',
    'https://registry.npmjs.org:444/robopomelo',
    credentialUrl.href,
    'https://registry.npmjs.org/other',
    'https://registry.npmjs.org/robopomelo?project=secret',
  ])
    await expect(network.json(url)).rejects.toMatchObject({ code: 'UPDATE_URL_DENIED' });
});
it('bounds metadata bytes, redirects and request duration', async () => {
  await expect(
    new PublicReleaseNetwork(async () => new Response('x'.repeat(100))).json(
      'https://registry.npmjs.org/robopomelo/latest',
      { maxBytes: 10 },
    ),
  ).rejects.toMatchObject({ code: 'UPDATE_LIMIT' });
  await expect(
    new PublicReleaseNetwork(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://registry.npmjs.org/robopomelo/latest' },
        }),
    ).json('https://registry.npmjs.org/robopomelo/latest'),
  ).rejects.toMatchObject({ code: 'UPDATE_REDIRECT_LIMIT' });
  await expect(
    new PublicReleaseNetwork(
      async (_url, signal) =>
        new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
    ).json('https://registry.npmjs.org/robopomelo/latest', { timeoutMs: 10 }),
  ).rejects.toThrow();
});
it('offline transport does not invoke even an injected network adapter', async () => {
  let calls = 0;
  const network = new PublicReleaseNetwork(async () => {
    calls++;
    return new Response('{}');
  });
  await expect(
    network.json('https://registry.npmjs.org/robopomelo/latest', { offline: true }),
  ).rejects.toMatchObject({ code: 'OFFLINE' });
  expect(calls).toBe(0);
});
import { afterEach } from 'vitest';
import { mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeCache } from '../../apps/cli/src/runtime/cache.js';
import { release, syntheticVerifier } from './helpers/release.js';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function cache() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'rp-cache-')));
  roots.push(directory);
  return new RuntimeCache({ directory, verify: syntheticVerifier });
}
it('stages verified immutable runtime bytes before atomically promoting selection', async () => {
  const c = await cache(),
    r = await release();
  const descriptor = await c.install(r.metadata, async (sink) => sink(r.bytes), r.attestations);
  expect((await c.pointer()).active).toBeNull();
  await c.promote(descriptor);
  expect((await c.pointer()).active?.version).toBe('1.0.0');
  expect((await c.get('1.0.0'))?.manifest.version).toBe('1.0.0');
});
it('rejects corrupted cache bytes even when the cached manifest is edited to match', async () => {
  const c = await cache(),
    r = await release();
  const d = await c.install(r.metadata, async (sink) => sink(r.bytes), r.attestations);
  await writeFile(join(d.directory, 'runtime/main.mjs'), 'malicious payload');
  const m = JSON.parse(await readFile(join(d.directory, 'runtime-manifest.json'), 'utf8'));
  m.files.find((f: { path: string }) => f.path === 'runtime/main.mjs').sha256 = '0'.repeat(64);
  await writeFile(join(d.directory, 'runtime-manifest.json'), JSON.stringify(m));
  await expect(c.get('1.0.0')).rejects.toMatchObject({ code: 'RUNTIME_CORRUPT' });
});
it('preserves active and previous working runtimes on failed verification or promotion', async () => {
  const c = await cache(),
    a = await release('1.0.0'),
    b = await release('1.1.0');
  const first = await c.install(a.metadata, async (sink) => sink(a.bytes), a.attestations);
  await c.promote(first);
  await expect(c.install(b.metadata, async (sink) => sink(b.bytes), { synthetic: false })).rejects.toThrow();
  expect((await c.pointer()).active?.version).toBe('1.0.0');
  const second = await c.install(b.metadata, async (sink) => sink(b.bytes), b.attestations);
  await c.promote(second);
  expect((await c.pointer()).previous?.version).toBe('1.0.0');
  expect(await c.get('1.0.0')).not.toBeNull();
});
it('serializes concurrent installations without a partial selected runtime', async () => {
  const c = await cache(),
    a = await release('1.0.0'),
    b = await release('1.1.0');
  const both = await Promise.all([
    c.install(a.metadata, async (sink) => sink(a.bytes), a.attestations),
    c.install(b.metadata, async (sink) => sink(b.bytes), b.attestations),
  ]);
  await Promise.all(both.map((d) => c.promote(d)));
  expect((await c.list()).map((d) => d.manifest.version).sort()).toEqual(['1.0.0', '1.1.0']);
});
it('does not admit an incomplete signed payload into the verified cache catalogue', async () => {
  const c = await cache(),
    r = await release();
  const bytes = await archive([{ name: 'package/runtime/main.mjs', body: 'incomplete' }]);
  const metadata = {
    ...r.metadata,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
  await expect(c.install(metadata, async (sink) => sink(bytes), r.attestations)).rejects.toThrow();
  expect(await c.list()).toEqual([]);
});
import { archive } from './helpers/archive.js';
import { createHash } from 'node:crypto';
it('preserves selection when a download fails with disk exhaustion', async () => {
  const c = await cache(),
    r = await release();
  const d = await c.install(r.metadata, async (sink) => sink(r.bytes), r.attestations);
  await c.promote(d);
  await expect(
    c.install(
      r.metadata,
      async () => {
        throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
      },
      r.attestations,
    ),
  ).rejects.toMatchObject({ code: 'ENOSPC' });
  expect((await c.pointer()).active?.version).toBe('1.0.0');
});
it('does not run lifecycle scripts while staging package contents', async () => {
  const c = await cache(),
    r = await release('1.0.0', {
      'package.json': JSON.stringify({
        name: 'robopomelo',
        version: '1.0.0',
        scripts: { postinstall: "node -e \"require('node:fs').writeFileSync('EXECUTED','bad')\"" },
      }),
    });
  const d = await c.install(r.metadata, async (sink) => sink(r.bytes), r.attestations);
  await expect(stat(join(d.directory, 'EXECUTED'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await c.pointer()).active).toBeNull();
});
import { stat } from 'node:fs/promises';
it('aborted promotion leaves the active selection unchanged', async () => {
  const c = await cache(),
    a = await release('1.0.0'),
    b = await release('1.1.0');
  const first = await c.install(a.metadata, async (sink) => sink(a.bytes), a.attestations);
  await c.promote(first);
  const second = await c.install(b.metadata, async (sink) => sink(b.bytes), b.attestations);
  const controller = new AbortController();
  controller.abort();
  await expect(c.promote(second, controller.signal)).rejects.toMatchObject({ code: 'UPDATE_TIMEOUT' });
  expect((await c.pointer()).active?.version).toBe('1.0.0');
});
it('rejects malformed machine cache pointers without rewriting them', async () => {
  const c = await cache(),
    r = await release();
  const d = await c.install(r.metadata, async (sink) => sink(r.bytes), r.attestations);
  await c.promote(d);
  const path = join(d.directory, '../../../selection.json');
  const bytes = JSON.stringify({
    formatVersion: 1,
    active: { directory: '../../escape', version: 'latest', sha256: '0'.repeat(64) },
    previous: null,
    pendingVersion: null,
    lastOutcome: null,
  });
  await writeFile(path, bytes);
  await expect(c.pointer()).rejects.toMatchObject({ code: 'CACHE_INVALID' });
  expect(await readFile(path, 'utf8')).toBe(bytes);
});
