import { afterEach, expect, it } from 'vitest';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SPATIAL_CAPABILITY, type SpatialAction } from '@robopomelo/spec';
import { bundledCatalog, assetRefFor } from '@robopomelo/spatial';
import { startServer } from '../../packages/application/src/server/start.js';
import { ProjectService } from '../../packages/application/src/services/project.js';
import { spatialRoutes } from '../../packages/application/src/server/spatial-routes.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function host() {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'rp-spatial-routes-')));
  cleanup.push(() => rm(temp, { recursive: true, force: true }));
  const project = new ProjectService({ toolVersion: 'test', configDirectory: join(temp, 'config') });
  await project.create(join(temp, 'project'), 'Routes');
  await project.grant(['author'], 'autonomous', false);
  const server = await startServer({ toolVersion: 'test', routes: spatialRoutes(project), onClose: () => project.close() });
  cleanup.push(() => server.close());
  server.setProjectStatus(project.status());
  const boot = await fetch(server.url + '/api/session', { method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: new URL(server.bootstrapUrl).hash.slice(1) }) });
  const session = (await boot.json()).data as { credential: string; csrf: string; projectEpoch: string };
  const call = async (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(server.url + path, { method, headers: { Authorization: `Bearer ${session.credential}`, 'X-RP-Project-Epoch': session.projectEpoch, 'X-RP-CSRF': session.csrf, Origin: server.url, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: (await response.json()) as { ok: boolean; data?: unknown; error?: { code: string } } };
  };
  return { call, project };
}
const rack = assetRefFor(bundledCatalog().entries.find(e => e.id === 'rack-row')!);
const known = <T,>(value: T) => ({ state: 'known' as const, value, sourceIds: [] as string[] });
it('exposes capabilities and catalog, commits a checked spatial envelope and serves the compiled scene', async () => {
  const h = await host();
  const capabilities = (await h.call('/api/capabilities')).body.data as { activated: string[]; available: { id: string }[] };
  expect(capabilities.activated).toEqual([]);
  expect(capabilities.available.some(c => c.id === SPATIAL_CAPABILITY)).toBe(true);
  const catalog = (await h.call('/api/catalog')).body.data as { entries: { id: string; version: string; sha256: string }[] };
  expect(catalog.entries.map(e => e.id)).toContain('rack-row');
  expect(JSON.stringify(catalog)).not.toMatch(/http:|https:/);
  const snapshot = await h.project.snapshot();
  const actions: SpatialAction[] = [
    { kind: 'activate', capability: SPATIAL_CAPABILITY },
    { kind: 'define-scene', scene: { id: 'scene-1', name: 'Receiving', floor: known({ lengthM: 60, widthM: 40 }) } },
    { kind: 'register-asset', asset: rack },
    { kind: 'place', sceneId: 'scene-1', instance: { id: 'rack-1', asset: rack, pose: { xM: 10, yM: 5, zM: 0, yawRad: 0 }, dimensions: known({ lengthM: 12, widthM: 1.2, heightM: 6 }), sourceIds: [] } },
  ];
  const envelope = { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash, mutationId: 'scene-change-1', purpose: 'Initial layout', actions };
  const committed = await h.call('/api/scenes/actions', envelope);
  expect(committed.status, JSON.stringify(committed.body)).toBe(200);
  expect((committed.body.data as { kind: string }).kind).toBe('committed');
  expect((await h.call('/api/scenes/actions', envelope)).body.data).toMatchObject({ kind: 'committed', alreadyApplied: true });
  const stale = await h.call('/api/scenes/actions', { ...envelope, mutationId: 'scene-change-2', actions: [{ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 12, yM: 5, zM: 0, yawRad: 0 } }] });
  expect(stale.body.error?.code).toBe('STALE_BASE');
  expect((await h.call('/api/scenes/actions', { ...envelope, mutationId: 'bad id!' })).body.error?.code).toBe('INVALID_INPUT');
  expect((await h.call('/api/scenes/actions', { ...envelope, mutationId: 'scene-change-3', actions: [{ kind: 'teleport' }] })).body.error?.code).toBe('INVALID_SCHEMA');
  const scene = (await h.call('/api/scenes/scene-1')).body.data as { scene: { instances: unknown[] }; compiled: { objects: { instanceId: string; collision: { polygon: number[][] } }[] } };
  expect(scene.scene.instances).toHaveLength(1);
  expect(scene.compiled.objects[0]!.instanceId).toBe('rack-1');
  expect(scene.compiled.objects[0]!.collision.polygon).toHaveLength(4);
  expect((await h.call('/api/scenes/scene-9')).body.error?.code).toBe('RECORD_NOT_FOUND');
  expect(((await h.call('/api/capabilities')).body.data as { activated: string[] }).activated).toEqual([SPATIAL_CAPABILITY]);
  expect(((await h.call('/api/scenes')).body.data as { scenes: { id: string }[] }).scenes.map(s => s.id)).toEqual(['scene-1']);
});
