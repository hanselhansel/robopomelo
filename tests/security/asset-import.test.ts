import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
import { importAsset, ASSET_BYTE_LIMIT, ASSET_TRIANGLE_LIMIT } from '../../packages/project-fs/src/assets/import.js';
import { AssetStore } from '../../packages/project-fs/src/assets/store.js';
type Json = Record<string, unknown>;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pad4 = (n: number) => (n + 3) & ~3;
/** Minimal glTF 2.0 binary builder: one indexed triangle in one buffer. */
function triangleJson(): Json {
  return {
    asset: { version: '2.0', generator: 'robopomelo-test' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    buffers: [{ byteLength: 44 }],
  };
}
function triangleBin(): Uint8Array {
  const bin = new Uint8Array(44), view = new DataView(bin.buffer);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => view.setFloat32(i * 4, v, true));
  [0, 1, 2].forEach((v, i) => view.setUint16(36 + i * 2, v, true));
  return bin;
}
type GlbOptions = { json?: (j: Json) => void; bin?: Uint8Array | null; magic?: string; version?: number; rawJson?: string; declaredLength?: number; jsonType?: number };
function glb(options: GlbOptions = {}): Uint8Array {
  const json = triangleJson();
  options.json?.(json);
  const jsonText = options.rawJson ?? JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonText), jsonPadded = pad4(jsonBytes.byteLength);
  const bin = options.bin === undefined ? triangleBin() : options.bin;
  const binPadded = bin ? pad4(bin.byteLength) : 0;
  const total = 12 + 8 + jsonPadded + (bin ? 8 + binPadded : 0);
  const out = new Uint8Array(total), view = new DataView(out.buffer);
  out.set(new TextEncoder().encode(options.magic ?? 'glTF'), 0);
  view.setUint32(4, options.version ?? 2, true);
  view.setUint32(8, options.declaredLength ?? total, true);
  view.setUint32(12, jsonPadded, true); view.setUint32(16, options.jsonType ?? 0x4e4f534a, true);
  out.set(jsonBytes, 20); out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded);
  if (bin) { const at = 20 + jsonPadded; view.setUint32(at, binPadded, true); view.setUint32(at + 4, 0x004e4942, true); out.set(bin, at + 8); }
  return out;
}
const license = { spdx: 'CC0-1.0', source: 'test fixture' };
const declared = (bytes: Uint8Array) => ({ sha256: sha(bytes), size: bytes.byteLength });
const cleanups: (() => Promise<unknown>)[] = [];
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'robopomelo-assets-'));
  const dir = join(base, 'project');
  await mkdir(dir);
  const root = await SafeRoot.open(dir);
  cleanups.push(async () => { await root.close(); await rm(base, { recursive: true, force: true }); });
  return { root, dir, store: new AssetStore(root) };
}
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function tree(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name), rel = prefix + name;
    if ((await lstat(path)).isDirectory()) out.push(...await tree(path, rel + '/')); else out.push(rel);
  }
  return out;
}
describe('bounded GLB import into content-addressed storage', () => {
  it('publishes verified bytes under assets/sha256/<digest>/ with a deterministic manifest', async () => {
    const { root, dir, store } = await fixture();
    const bytes = glb();
    const manifest = await importAsset(root, { bytes, declared: declared(bytes), title: 'Triangle', license });
    const digest = sha(bytes);
    expect(manifest).toEqual({ formatVersion: '1.0.0', sha256: digest, size: bytes.byteLength, format: 'glb', path: `assets/sha256/${digest}/original.glb`, title: 'Triangle', license, triangles: 1, meshes: 1 });
    expect(await tree(dir)).toEqual([`assets/sha256/${digest}/manifest.json`, `assets/sha256/${digest}/original.glb`]);
    expect((await root.readFile(manifest.path)).equals(Buffer.from(bytes))).toBe(true);
    expect(await store.list()).toEqual([manifest]);
    expect((await store.open(digest)).equals(Buffer.from(bytes))).toBe(true);
  });
  it('accepts a streamed source and is idempotent for identical bytes', async () => {
    const { root, dir, store } = await fixture();
    const bytes = glb();
    async function* chunks() { yield bytes.subarray(0, 13); yield bytes.subarray(13, 40); yield bytes.subarray(40); }
    const first = await importAsset(root, { bytes: chunks(), declared: declared(bytes), title: 'Triangle', license });
    const second = await importAsset(root, { bytes, declared: declared(bytes), title: 'Triangle', license });
    expect(second).toEqual(first);
    expect(await tree(dir)).toEqual([`assets/sha256/${first.sha256}/manifest.json`, `assets/sha256/${first.sha256}/original.glb`]);
    expect(await store.list()).toHaveLength(1);
  });
  it('rejects a claimed digest whose bytes differ and a declared size that disagrees', async () => {
    const { root, dir } = await fixture();
    const bytes = glb(), other = glb({ json: (j) => { (j.asset as Json).generator = 'robopomelo-TEST'; } });
    expect(other.byteLength).toBe(bytes.byteLength);
    await expect(importAsset(root, { bytes: other, declared: declared(bytes), title: 'x', license })).rejects.toMatchObject({ code: 'ASSET_HASH_MISMATCH' });
    await expect(importAsset(root, { bytes, declared: { sha256: sha(bytes), size: bytes.byteLength + 1 }, title: 'x', license })).rejects.toMatchObject({ code: 'ASSET_SIZE_MISMATCH' });
    await expect(importAsset(root, { bytes, declared: { sha256: 'nothex', size: bytes.byteLength }, title: 'x', license })).rejects.toMatchObject({ code: 'INVALID_DIGEST' });
    expect(await tree(dir)).toEqual([]);
  });
  it('rejects bytes that collide with a published digest but differ from stored content', async () => {
    const { root } = await fixture();
    const bytes = glb();
    await importAsset(root, { bytes, declared: declared(bytes), title: 'Triangle', license });
    await expect(importAsset(root, { bytes, declared: declared(bytes), title: 'Renamed', license })).rejects.toMatchObject({ code: 'ASSET_CONFLICT' });
  });
  it.each<[string, () => Uint8Array, string]>([
    ['oversize', () => new Uint8Array(ASSET_BYTE_LIMIT + 1), 'ASSET_TOO_LARGE'],
    ['bad magic', () => glb({ magic: 'GLTF' }), 'ASSET_FORMAT_INVALID'],
    ['wrong version', () => glb({ version: 1 }), 'ASSET_FORMAT_INVALID'],
    ['wrong declared length', () => glb({ declaredLength: 10 }), 'ASSET_FORMAT_INVALID'],
    ['missing JSON chunk', () => glb({ jsonType: 0x004e4942 }), 'ASSET_FORMAT_INVALID'],
    ['malformed JSON', () => glb({ rawJson: '{"asset":' }), 'ASSET_FORMAT_INVALID'],
    ['non-object JSON', () => glb({ rawJson: '[1,2]' }), 'ASSET_FORMAT_INVALID'],
    ['wrong glTF asset version', () => glb({ json: (j) => { (j.asset as Json).version = '1.0'; } }), 'ASSET_FORMAT_INVALID'],
    ['external buffer uri', () => glb({ json: (j) => { ((j.buffers as Json[])[0] as Json).uri = 'https://example.com/a.bin'; } }), 'ASSET_EXTERNAL_REFERENCE'],
    ['nested image uri', () => glb({ json: (j) => { j.images = [{ uri: 'data:image/png;base64,AAAA' }]; } }), 'ASSET_EXTERNAL_REFERENCE'],
    ['deep uri in extras', () => glb({ json: (j) => { j.extras = { nested: [{ uri: 'x' }] }; } }), 'ASSET_EXTERNAL_REFERENCE'],
    ['extensionsUsed', () => glb({ json: (j) => { j.extensionsUsed = ['KHR_draco_mesh_compression']; } }), 'ASSET_UNSUPPORTED_EXTENSION'],
    ['extensionsRequired', () => glb({ json: (j) => { j.extensionsRequired = ['KHR_texture_basisu']; } }), 'ASSET_UNSUPPORTED_EXTENSION'],
    ['skins', () => glb({ json: (j) => { j.skins = [{ joints: [0] }]; } }), 'ASSET_UNSUPPORTED_FEATURE'],
    ['animations', () => glb({ json: (j) => { j.animations = []; } }), 'ASSET_UNSUPPORTED_FEATURE'],
    ['too many triangles', () => glb({ json: (j) => { ((j.accessors as Json[])[1] as Json).count = (ASSET_TRIANGLE_LIMIT + 1) * 3; ((j.bufferViews as Json[])[1] as Json).byteLength = (ASSET_TRIANGLE_LIMIT + 1) * 6; (j.buffers as Json[])[0]!.byteLength = 36 + (ASSET_TRIANGLE_LIMIT + 1) * 6; }, bin: new Uint8Array(36 + (ASSET_TRIANGLE_LIMIT + 1) * 6) }), 'ASSET_TOO_COMPLEX'],
    ['too many unindexed triangles', () => glb({ json: (j) => { delete ((j.meshes as Json[])[0] as { primitives: Json[] }).primitives[0]!.indices; ((j.accessors as Json[])[0] as Json).count = (ASSET_TRIANGLE_LIMIT + 1) * 3; ((j.bufferViews as Json[])[0] as Json).byteLength = (ASSET_TRIANGLE_LIMIT + 1) * 36; (j.buffers as Json[])[0]!.byteLength = (ASSET_TRIANGLE_LIMIT + 1) * 36 + 8; }, bin: new Uint8Array((ASSET_TRIANGLE_LIMIT + 1) * 36 + 8) }), 'ASSET_TOO_COMPLEX'],
    ['buffer larger than binary chunk', () => glb({ json: (j) => { (j.buffers as Json[])[0]!.byteLength = 1 << 30; } }), 'ASSET_BUFFER_MISMATCH'],
    ['buffer without binary chunk', () => glb({ bin: null }), 'ASSET_BUFFER_MISMATCH'],
    ['accessor beyond buffer view', () => glb({ json: (j) => { ((j.accessors as Json[])[1] as Json).count = 300; } }), 'ASSET_BUFFER_MISMATCH'],
    ['buffer view beyond buffer', () => glb({ json: (j) => { ((j.bufferViews as Json[])[1] as Json).byteLength = 4096; } }), 'ASSET_BUFFER_MISMATCH'],
    ['second buffer', () => glb({ json: (j) => { (j.buffers as Json[]).push({ byteLength: 4 }); } }), 'ASSET_BUFFER_MISMATCH'],
    ['primitive count not divisible by three', () => glb({ json: (j) => { ((j.accessors as Json[])[1] as Json).count = 2; } }), 'ASSET_FORMAT_INVALID'],
    ['unsupported primitive mode', () => glb({ json: (j) => { ((j.meshes as Json[])[0] as { primitives: Json[] }).primitives[0]!.mode = 1; } }), 'ASSET_UNSUPPORTED_FEATURE'],
    ['prototype key', () => glb({ rawJson: JSON.stringify(triangleJson()).replace('"scene"', '"__proto__"') }), 'ASSET_FORMAT_INVALID'],
  ])('rejects %s and leaves nothing on disk', async (_name, make, code) => {
    const { root, dir } = await fixture();
    const bytes = make();
    await expect(importAsset(root, { bytes, declared: declared(bytes), title: 'x', license })).rejects.toMatchObject({ code });
    expect((await tree(dir)).filter((p) => !p.endsWith('/'))).toEqual([]);
  });
  it('removes the staged part when the stream fails mid-way', async () => {
    const { root, dir } = await fixture();
    const bytes = glb();
    async function* broken() { yield bytes.subarray(0, 20); throw new Error('disk unplugged'); }
    await expect(importAsset(root, { bytes: broken(), declared: declared(bytes), title: 'x', license })).rejects.toThrow('disk unplugged');
    expect((await tree(dir)).filter((p) => p.endsWith('.part') || p.startsWith('assets/'))).toEqual([]);
  });
  it('generates every path itself so a crafted destination or symlink target cannot be chosen', async () => {
    const { root, store } = await fixture();
    const bytes = glb();
    const manifest = await importAsset(root, { bytes, declared: declared(bytes), title: '../../etc/passwd', license: { spdx: 'CC0-1.0', source: '..\\..\\x' } } as never);
    expect(manifest.path).toBe(`assets/sha256/${manifest.sha256}/original.glb`);
    expect(manifest.path).toMatch(/^assets\/sha256\/[a-f0-9]{64}\/original\.glb$/);
    await expect(store.open('../../etc/passwd')).rejects.toMatchObject({ code: 'INVALID_DIGEST' });
    await expect(store.open('a'.repeat(64))).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
  });
  it('re-verifies stored bytes on open and refuses tampered content', async () => {
    const { root, dir, store } = await fixture();
    const bytes = glb();
    const manifest = await importAsset(root, { bytes, declared: declared(bytes), title: 'x', license });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, manifest.path), Buffer.concat([Buffer.from(bytes), Buffer.from([1])]));
    await expect(store.open(manifest.sha256)).rejects.toMatchObject({ code: 'ASSET_HASH_MISMATCH' });
    await writeFile(join(dir, 'assets/sha256', manifest.sha256, 'manifest.json'), '{"value":{},"checksum":"x"}');
    await expect(store.list()).rejects.toMatchObject({ code: 'STORAGE_INVALID' });
  });
});
