import { mkdtemp, mkdir, realpath, rm, readFile, writeFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectService, AgentGrantStore } from '@robopomelo/application';
import { EvidenceService } from '@robopomelo/project-fs';
import { AttachmentBroker } from '../../apps/desktop/src/attachment-broker.js';
import { PreviewStore } from '../../apps/desktop/src/preview-protocol.js';
import { NativeSetupService } from '../../apps/desktop/src/native-setup.js';
import { stringify } from 'yaml';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture() {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'rp-native-setup-')));
  cleanup.push(() => rm(base, { recursive: true, force: true }));
  const folder = join(base, 'project'); await mkdir(folder);
  const project = new ProjectService({ toolVersion: 'test', configDirectory: join(base, 'settings') });
  cleanup.push(() => project.close());
  const attachments = new AttachmentBroker({ context: () => project.epoch, previews: new PreviewStore(),
    parse: async () => { throw new Error('Unused'); } });
  cleanup.push(() => attachments.close());
  const setup = new NativeSetupService(project, attachments, () => {});
  return { base, folder, project, attachments, setup };
}
const intent = { name: 'Receiving study', seed: 'blank', description: 'Move pallets from receiving to storage.', attachmentIds: [] };
it('prepares without writing and confirms creation, permissions and original planning evidence', async () => {
  const f = await fixture();
  const inputPath = join(f.base, 'notes.txt'); await writeFile(inputPath, 'Original selected material');
  const [file] = await f.attachments.select([inputPath]);
  await f.setup.prepare({ ...intent, attachmentIds: [file!.selectionId] });
  expect((await f.project.settings.read()).grants).toEqual([]);
  await expect(readFile(join(f.folder, 'deployment.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
  const preview = await f.setup.preview(f.folder, 'recommended', 'create');
  expect(preview.detail).toContain('Receiving study');
  await f.setup.confirm(f.folder, 'recommended', 'create', preview.revision);
  const snapshot = await f.project.snapshot();
  expect(snapshot.deployment.project.name).toBe('Receiving study');
  expect(snapshot.deployment.evidence).toHaveLength(2);
  const contents = await Promise.all(snapshot.deployment.evidence.map(async record => {
    if (record.location.kind !== 'attachment') throw new Error('Expected local evidence');
    return (await readFile(join(f.folder, record.location.path))).toString();
  }));
  expect(contents).toEqual(expect.arrayContaining([intent.description, 'Original selected material']));
  expect(f.project.status().scopes).toContain('author');
  const current = f.project.current!;
  const grant = await new AgentGrantStore(f.project.settings).lookup({ ...current.root.identity(), projectId: current.projectId! });
  expect(grant?.scopes).toContain('use-connected-ai');
});
it('rejects stale prepared content and invalid inspection creation before writes', async () => {
  const f = await fixture(); await f.setup.prepare(intent);
  await expect(f.setup.preview(f.folder, 'inspection', 'create')).rejects.toThrow();
  const old = await f.setup.preview(f.folder, 'recommended', 'create');
  await f.setup.prepare({ ...intent, name: 'Changed' });
  await expect(f.setup.confirm(f.folder, 'recommended', 'create', old.revision)).rejects.toThrow('SETUP_CHANGED');
  await expect(readFile(join(f.folder, 'deployment.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('opens in inspection without modifying the project and creates the fictional example when selected', async () => {
  const f = await fixture();
  await f.setup.prepare({ ...intent, seed: 'inbound-pallet', description: '' });
  const first = await f.setup.preview(f.folder, 'recommended', 'create');
  await f.setup.confirm(f.folder, 'recommended', 'create', first.revision);
  expect((await f.project.snapshot()).deployment.workflows.length).toBeGreaterThan(0);
  const before = await readFile(join(f.folder, 'deployment.yaml'));
  await f.setup.prepare({ ...intent, description: '' });
  const inspect = await f.setup.preview(f.folder, 'inspection', 'open');
  await f.setup.confirm(f.folder, 'inspection', 'open', inspect.revision);
  expect(await readFile(join(f.folder, 'deployment.yaml'))).toEqual(before);
  expect(f.project.status().scopes).toEqual(['inspect']);
});

it('opens an invalid source for inspection without granting write or AI authority', async () => {
  const f = await fixture();
  await writeFile(join(f.folder, 'deployment.yaml'), 'invalid: [');
  await f.setup.prepare({ ...intent, description: '' });
  const preview = await f.setup.preview(f.folder, 'inspection', 'open');
  await f.setup.confirm(f.folder, 'inspection', 'open', preview.revision);
  expect((await f.project.read()).kind).toBe('inspection');
  expect((await f.project.settings.read()).grants).toEqual([]);
  expect(await readFile(join(f.folder, 'deployment.yaml'), 'utf8')).toBe('invalid: [');
});

it('rejects an existing project whose identity changes after the displayed setup', async () => {
  const f = await fixture(); await f.project.create(f.folder, 'Original');
  await f.setup.prepare({ ...intent, description: '' });
  const preview = await f.setup.preview(f.folder, 'recommended', 'open');
  const deployment = structuredClone((await f.project.snapshot()).deployment);
  deployment.project.id = 'replacement-project';
  await writeFile(join(f.folder, 'deployment.yaml'), stringify(deployment));
  await expect(f.setup.confirm(f.folder, 'recommended', 'open', preview.revision)).rejects.toThrow('SETUP_CHANGED');
  expect((await f.project.settings.read()).grants).toEqual([]);
});

it('does not initialize a replacement directory after the confirmed root was swapped', async () => {
  const f = await fixture(); await f.setup.prepare(intent);
  const preview = await f.setup.preview(f.folder, 'recommended', 'create');
  const create = f.project.create.bind(f.project);
  vi.spyOn(f.project, 'create').mockImplementationOnce(async (...args) => {
    await rename(f.folder, f.folder + '-original'); await mkdir(f.folder);
    return create(...args);
  });
  await expect(f.setup.confirm(f.folder, 'recommended', 'create', preview.revision)).rejects.toThrow();
  await expect(readFile(join(f.folder, 'deployment.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await f.project.settings.read()).grants).toEqual([]);
});

/** Two selected files plus the brief, with the second import attempt failing once after the first committed. */
async function interrupted() {
  const f = await fixture();
  const paths = [join(f.base, 'a.txt'), join(f.base, 'b.txt')];
  await writeFile(paths[0]!, 'First original'); await writeFile(paths[1]!, 'Second original');
  const files = await f.attachments.select(paths);
  const { revision } = await f.setup.prepare({ ...intent, attachmentIds: files.map(file => file.selectionId) });
  const preview = await f.setup.preview(f.folder, 'recommended', 'create');
  const accept = EvidenceService.prototype.accept;
  let calls = 0;
  vi.spyOn(EvidenceService.prototype, 'accept').mockImplementation(async function (this: EvidenceService, ...args) {
    if (++calls === 2) throw new Error('Simulated disk interruption');
    return accept.apply(this, args);
  });
  await expect(f.setup.confirm(f.folder, 'recommended', 'create', preview.revision)).rejects.toThrow('Simulated disk interruption');
  return { ...f, revision };
}
const grantIds = async (f: Awaited<ReturnType<typeof fixture>>) => (await f.project.settings.read()).grants.map(grant => [grant.grantId, grant.revokedAt ?? null]);

it('keeps an interrupted import resumable against the created project without duplicate evidence or regranting', async () => {
  const f = await interrupted();
  expect(f.project.status().projectOpen).toBe(true);
  const epoch = f.project.epoch;
  expect((await f.project.snapshot()).deployment.evidence).toHaveLength(1);
  const grantsBefore = await grantIds(f);
  expect(grantsBefore.length).toBeGreaterThan(0);
  expect(f.setup.status()).toMatchObject({ state: 'pending', revision: f.revision, projectEpoch: epoch, imported: 1, total: 3 });
  expect(f.setup.status()).toMatchObject({ error: expect.stringContaining('Simulated disk interruption') });
  await expect(f.setup.prepare(intent)).rejects.toMatchObject({ code: 'SETUP_PENDING' });
  const status = await f.setup.resume(f.revision);
  expect(status).toMatchObject({ state: 'completed', revision: f.revision, projectEpoch: epoch, imported: 3, total: 3 });
  expect(f.project.epoch).toBe(epoch);
  const snapshot = await f.project.snapshot();
  expect(snapshot.deployment.evidence).toHaveLength(3);
  const contents = await Promise.all(snapshot.deployment.evidence.map(async record => {
    if (record.location.kind !== 'attachment') throw new Error('Expected local evidence');
    return (await readFile(join(f.folder, record.location.path))).toString();
  }));
  expect(contents.sort()).toEqual(['First original', intent.description, 'Second original'].sort());
  expect(await grantIds(f)).toEqual(grantsBefore);
  expect(await f.setup.resume(f.revision)).toMatchObject({ state: 'completed', imported: 3 });
  expect((await f.project.snapshot()).deployment.evidence).toHaveLength(3);
});

it('reports a completed setup for lost-response readback without creating another project', async () => {
  const f = await fixture(); const { revision } = await f.setup.prepare(intent);
  const preview = await f.setup.preview(f.folder, 'recommended', 'create');
  await f.setup.confirm(f.folder, 'recommended', 'create', preview.revision);
  const epoch = f.project.epoch;
  expect(f.setup.status()).toMatchObject({ state: 'completed', revision, projectEpoch: epoch, imported: 1, total: 1 });
  expect(await f.setup.resume(revision)).toMatchObject({ state: 'completed', projectEpoch: epoch });
  expect(f.project.epoch).toBe(epoch);
  expect((await f.project.snapshot()).deployment.evidence).toHaveLength(1);
  await expect(f.setup.resume('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'SETUP_NOT_FOUND' });
  await f.setup.prepare(intent);
  expect(f.setup.status()).toEqual({ state: 'idle' });
});

it('refuses to resume after the confirmed authority was revoked and never regrants it', async () => {
  const f = await interrupted();
  await f.project.revoke();
  const revoked = await grantIds(f);
  expect(revoked.every(([, revokedAt]) => revokedAt !== null)).toBe(true);
  await expect(f.setup.resume(f.revision)).rejects.toThrow();
  expect(await grantIds(f)).toEqual(revoked);
  expect((await f.project.snapshot()).deployment.evidence).toHaveLength(1);
  expect(f.setup.status()).toMatchObject({ state: 'pending', imported: 1 });
});

it('refuses to resume against a different project and lets the user discard the pending operation', async () => {
  const f = await interrupted();
  const other = join(f.base, 'other'); await mkdir(other);
  await f.project.create(other, 'Other');
  await expect(f.setup.resume(f.revision)).rejects.toMatchObject({ code: 'PROJECT_CHANGED' });
  expect((await f.project.snapshot()).deployment.evidence).toHaveLength(0);
  expect(f.setup.status()).toMatchObject({ state: 'pending' });
  f.setup.discard(f.revision);
  expect(f.setup.status()).toEqual({ state: 'idle' });
  await f.setup.prepare(intent);
  expect(f.setup.routes().map(route => route.method + ' ' + route.path).sort()).toEqual([
    'GET /api/intake/status', 'POST /api/intake/discard', 'POST /api/intake/prepare', 'POST /api/intake/resume',
  ]);
  expect(f.setup.routes().filter(route => route.path !== '/api/intake/prepare').every(route => route.projectScoped === false)).toBe(true);
});
