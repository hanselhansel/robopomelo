import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Instance } from '@robopomelo/spec';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
import { AssetLibrary, libraryRecordPath } from '../../packages/project-fs/src/assets/library.js';
import { bundledCatalog } from '../../packages/spatial/src/catalog.js';
import { RACK_ROW_RECIPE } from '../../packages/spatial/src/assembly.js';
import { newDraft, promote, validateDraft, type LibraryRecord } from '../../packages/spatial/src/draft.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
async function project() {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'rp-library-')));
  const path = join(base, 'project');
  await mkdir(path);
  const root = await SafeRoot.open(path);
  cleanup.push(async () => { await root.close(); await rm(base, { recursive: true, force: true }); });
  return { path, root, library: new AssetLibrary(root) };
}
const clock = () => '2026-09-08T00:00:00.000Z';
const ctx = { catalog: bundledCatalog() };
const schema = (lengthMax: number) => ({ type: 'object' as const, additionalProperties: false as const, properties: { lengthM: { type: 'number' as const, minimum: 1, maximum: lengthMax, default: 10.8, description: 'Row length.' } } });
function record(version: string, title = 'Rack row of four bays', lengthMax = 120): LibraryRecord {
  const draft = validateDraft(newDraft('rack-row-custom', 'assembly', { ...RACK_ROW_RECIPE, title, parameterSchema: schema(lengthMax) }), ctx);
  return promote(draft, { version, clock }).record;
}
const instance = (id: string, ref: LibraryRecord['ref'], lengthM = 10.8): { sceneId: string; instance: Instance } => ({
  sceneId: 'scene-1',
  instance: { id, asset: { ...ref }, pose: { xM: 0, yM: 0, zM: 0, yawRad: 0 }, dimensions: { state: 'known', value: { lengthM, widthM: 1.1, heightM: 6 }, sourceIds: ['s1'] }, sourceIds: [] },
});
const rejects = (promise: Promise<unknown>, code: string) => expect(promise).rejects.toThrow(expect.objectContaining({ code }));
describe('asset library records', () => {
  it('writes an immutable record, reads it back and lists it', async () => {
    const { library } = await project();
    const r = record('1.0.0');
    expect(await library.promote(r)).toEqual(r.ref);
    expect(await library.read('rack-row-custom', '1.0.0')).toEqual(r);
    expect(await library.list()).toEqual({ records: [r], damaged: [] });
    expect(libraryRecordPath('rack-row-custom', '1.0.0')).toBe('assets/library/rack-row-custom/1.0.0/record.json');
  });
  it('accepts duplicate promotion of identical content and rejects different content at the same version', async () => {
    const { library } = await project();
    const r = record('1.0.0');
    await library.promote(r);
    await library.promote(r);
    expect((await library.list()).records).toHaveLength(1);
    await rejects(library.promote(record('1.0.0', 'Rack row, taller')), 'ASSET_CONFLICT');
    expect(await library.read('rack-row-custom', '1.0.0')).toEqual(r);
  });
  it('reports an interrupted write instead of silently accepting a truncated record', async () => {
    const { library, path } = await project();
    const r = record('1.0.0');
    await library.promote(r);
    const file = join(path, libraryRecordPath('rack-row-custom', '1.0.0'));
    const bytes = await readFile(file);
    await writeFile(file, bytes.subarray(0, bytes.length - 20));
    await rejects(library.read('rack-row-custom', '1.0.0'), 'STORAGE_INVALID');
    const listed = await library.list();
    expect(listed.records).toEqual([]);
    expect(listed.damaged).toEqual([{ id: 'rack-row-custom', version: '1.0.0', code: 'STORAGE_INVALID' }]);
    await rejects(library.promote(r), 'ASSET_CONFLICT');
  });
  it('rejects records or references without a content hash and tampered content', async () => {
    const { library } = await project();
    const r = record('1.0.0');
    const { sha256: _ignored, ...bare } = r.ref;
    await rejects(library.promote({ ...r, ref: bare as unknown as LibraryRecord['ref'] }), 'ASSET_HASH_MISSING');
    await rejects(library.promote({ ...r, content: { ...(r.content as object), title: 'Edited' } }), 'ASSET_HASH_MISMATCH');
    await library.promote(r);
    const next = record('1.0.1');
    await library.promote(next);
    await rejects(library.previewUpgrade(bare as unknown as LibraryRecord['ref'], next.ref, []), 'ASSET_HASH_MISSING');
    await rejects(library.previewUpgrade({ ...r.ref, sha256: 'a'.repeat(64) }, next.ref, []), 'ASSET_HASH_MISMATCH');
    await rejects(library.read('rack-row-custom', '9.9.9'), 'ASSET_NOT_FOUND');
    await rejects(library.read('../escape', '1.0.0'), 'ASSET_RECORD_INVALID');
  });
});
describe('pinning and upgrade previews', () => {
  it('previews an upgrade with parameter changes, affected instances and the actions to apply, without writing', async () => {
    const { library } = await project();
    const v1 = record('1.0.0'), v2 = record('1.1.0', 'Rack row of four bays', 20);
    await library.promote(v1); await library.promote(v2);
    const instances = [instance('row-a', v1.ref), instance('row-b', v1.ref, 30), instance('row-c', v2.ref)];
    const preview = await library.previewUpgrade(v1.ref, v2.ref, instances);
    expect(preview.direction).toBe('upgrade');
    expect(preview.flagged).toBe(false);
    expect(preview.affectedInstanceIds).toEqual(['row-a', 'row-b']);
    expect(preview.parameterChanges).toEqual([{ name: 'lengthM', change: 'bounds-changed', from: { minimum: 1, maximum: 120 }, to: { minimum: 1, maximum: 20 } }]);
    expect(preview.actions[0]).toEqual({ kind: 'register-asset', asset: v2.ref });
    const placed = preview.actions.filter((a) => a.kind === 'place');
    expect(placed).toHaveLength(2);
    expect(preview.actions.filter((a) => a.kind === 'remove').map((a) => (a.kind === 'remove' ? a.replacementId : null))).toEqual(['row-a-1-1-0', 'row-b-1-1-0']);
    const b = placed[1]!;
    if (b.kind !== 'place') throw new Error('unreachable');
    expect(b.instance.asset).toEqual(v2.ref);
    expect(b.instance.dimensions).toMatchObject({ state: 'unverified', value: { lengthM: 20 } });
    expect(preview.resizedInstanceIds).toEqual(['row-b']);
    // Existing instances stay pinned: the preview writes nothing and the library is unchanged.
    expect((await library.list()).records).toHaveLength(2);
    expect(instances[0]!.instance.asset.version).toBe('1.0.0');
  });
  it('allows a downgrade preview but flags it', async () => {
    const { library } = await project();
    const v1 = record('1.0.0'), v2 = record('1.1.0', 'Rack row of four bays', 20);
    await library.promote(v1); await library.promote(v2);
    const preview = await library.previewUpgrade(v2.ref, v1.ref, [instance('row-c', v2.ref)]);
    expect(preview).toMatchObject({ direction: 'downgrade', flagged: true, affectedInstanceIds: ['row-c'] });
    await rejects(library.previewUpgrade(v1.ref, v1.ref, []), 'ASSET_SAME_VERSION');
    const other = validateDraft(newDraft('other-row', 'assembly', RACK_ROW_RECIPE), ctx);
    const o = promote(other, { version: '1.0.0', clock }).record;
    await library.promote(o);
    await rejects(library.previewUpgrade(v1.ref, o.ref, []), 'ASSET_MISMATCH');
  });
  it('keeps two projects referencing the same record independent', async () => {
    const a = await project(), b = await project();
    const r = record('1.0.0');
    await a.library.promote(r);
    await rejects(b.library.read('rack-row-custom', '1.0.0'), 'ASSET_NOT_FOUND');
    await b.library.promote(r);
    expect(await b.library.read('rack-row-custom', '1.0.0')).toEqual(r);
    await rejects(a.library.promote(record('1.0.0', 'Different')), 'ASSET_CONFLICT');
    expect(await b.library.read('rack-row-custom', '1.0.0')).toEqual(r);
  });
});
