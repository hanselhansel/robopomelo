import { afterEach, expect, it } from 'vitest';
import { mkdtemp, realpath, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import tar from 'tar-stream';
import { extractRuntime } from '../../apps/cli/src/runtime/extract.js';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function root() {
  const p = await realpath(await mkdtemp(join(tmpdir(), 'rp-extract-')));
  roots.push(p);
  return p;
}
export async function archive(
  entries: { name: string; body?: string; type?: tar.Header['type']; linkname?: string }[],
): Promise<Buffer> {
  const pack = tar.pack(),
    chunks: Buffer[] = [];
  pack.on('data', (c) => chunks.push(Buffer.from(c as Uint8Array)));
  const done = new Promise<Buffer>((resolve, reject) => {
    pack.on('end', () => resolve(gzipSync(Buffer.concat(chunks))));
    pack.on('error', reject);
  });
  for (const e of entries)
    pack.entry(
      { name: e.name, ...(e.type ? { type: e.type } : {}), ...(e.linkname ? { linkname: e.linkname } : {}) },
      e.body ?? '',
    );
  pack.finalize();
  return done;
}
it('extracts regular npm package files into an isolated directory', async () => {
  const p = await root();
  await extractRuntime(
    await archive([{ name: 'package/runtime/main.mjs', body: 'export const ok=true' }]),
    p,
  );
  expect(await readFile(join(p, 'runtime/main.mjs'), 'utf8')).toBe('export const ok=true');
});
it.each([
  '../escape',
  '/absolute',
  'package/../escape',
  'package/C:evil',
  'package/NUL',
  'package/a.',
  'package/a\\b',
])('rejects unsafe archive path %s', async (name) => {
  await expect(extractRuntime(await archive([{ name, body: 'bad' }]), await root())).rejects.toThrow();
});
it.each(['symlink', 'link', 'character-device', 'block-device', 'fifo'] as const)(
  'rejects archive entry type %s',
  async (type) => {
    await expect(
      extractRuntime(await archive([{ name: 'package/a', type, linkname: '../../outside' }]), await root()),
    ).rejects.toThrow();
  },
);
it('rejects duplicate and portable case-colliding archive names', async () => {
  for (const second of ['package/a', 'package/A'])
    await expect(
      extractRuntime(
        await archive([
          { name: 'package/a', body: 'first' },
          { name: second, body: 'second' },
        ]),
        await root(),
      ),
    ).rejects.toThrow();
});
it('bounds compressed, expanded and entry sizes before promotion', async () => {
  const bytes = await archive([{ name: 'package/bomb', body: 'x'.repeat(4096) }]);
  await expect(extractRuntime(bytes, await root(), { maxExpandedBytes: 100 })).rejects.toThrow();
  await expect(extractRuntime(bytes, await root(), { maxFileBytes: 100 })).rejects.toThrow();
  await expect(extractRuntime(bytes, await root(), { maxCompressedBytes: 10 })).rejects.toThrow();
});
