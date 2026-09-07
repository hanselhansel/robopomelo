import { afterEach, expect, it } from 'vitest';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SPATIAL_CAPABILITY, type SpatialAction } from '@robopomelo/spec';
import { bundledCatalog, assetRefFor } from '@robopomelo/spatial';
import { startServer } from '../../packages/application/src/server/start.js';
import { ProjectService } from '../../packages/application/src/services/project.js';
import { spatialRoutes } from '../../packages/application/src/server/spatial-routes.js';
import { exportRoutes } from '../../packages/application/src/server/export-routes.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const entry = (id: string) => assetRefFor(bundledCatalog().entries.find(e => e.id === id)!);
const known = <T,>(value: T) => ({ state: 'known' as const, value, sourceIds: [] as string[] });
const pose = (xM: number, yM: number) => ({ xM, yM, zM: 0, yawRad: 0 });
async function host() {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'rp-isaac-route-')));
  cleanup.push(() => rm(temp, { recursive: true, force: true }));
  const project = new ProjectService({ toolVersion: 'test', configDirectory: join(temp, 'config') });
  await project.create(join(temp, 'project'), 'Isaac');
  await project.grant(['author', 'export'], 'autonomous', false);
  const server = await startServer({ toolVersion: 'test', routes: [...spatialRoutes(project), ...exportRoutes(project)], onClose: () => project.close() });
  cleanup.push(() => server.close());
  server.setProjectStatus(project.status());
  const boot = await fetch(server.url + '/api/session', { method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: new URL(server.bootstrapUrl).hash.slice(1) }) });
  const session = (await boot.json()).data as { credential: string; csrf: string; projectEpoch: string };
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(server.url + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${session.credential}`, 'X-RP-Project-Epoch': session.projectEpoch, 'X-RP-CSRF': session.csrf, Origin: server.url, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: (await response.json()) as { ok: boolean; data?: unknown; error?: { code: string } } };
  };
  const snapshot = await project.snapshot();
  const robot = entry('robot-differential'), station = entry('station');
  const actions: SpatialAction[] = [
    { kind: 'activate', capability: SPATIAL_CAPABILITY },
    { kind: 'define-scene', scene: { id: 'scene-1', name: 'Cell', floor: known({ lengthM: 20, widthM: 10 }) } },
    { kind: 'register-asset', asset: robot }, { kind: 'register-asset', asset: station },
    { kind: 'place', sceneId: 'scene-1', instance: { id: 'robot-a', asset: robot, pose: pose(2, 2), dimensions: known({ lengthM: 0.8, widthM: 0.6, heightM: 0.4 }), sourceIds: [] } },
    { kind: 'place', sceneId: 'scene-1', instance: { id: 'robot-b', asset: robot, pose: pose(2, 8), dimensions: known({ lengthM: 0.8, widthM: 0.6, heightM: 0.4 }), sourceIds: [] } },
    { kind: 'place', sceneId: 'scene-1', instance: { id: 'pickup', asset: station, pose: pose(18, 2), dimensions: known({ lengthM: 1, widthM: 1, heightM: 0.2 }), sourceIds: [] } },
    { kind: 'place', sceneId: 'scene-1', instance: { id: 'dropoff', asset: station, pose: pose(18, 8), dimensions: known({ lengthM: 1, widthM: 1, heightM: 0.2 }), sourceIds: [] } },
    { kind: 'define-robot-profile', profile: { id: 'profile-diff', drive: 'differential', footprintM: [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]], loadedFootprintM: [[-0.5, -0.4], [0.5, -0.4], [0.5, 0.4], [-0.5, 0.4]], heightM: 0.4, maxSpeedMps: 1, maxAngularRadps: 1, accelerationMps2: 0.5, decelerationMps2: 0.5, reverse: false } },
    { kind: 'define-scenario', scenario: { id: 'scenario-1', sceneId: 'scene-1', name: 'Two Jetbots', robotProfileIds: ['profile-diff'], fleetSize: known(2), stations: [{ id: 's-pick', instanceId: 'pickup', kind: 'pickup', capacity: 1 }, { id: 's-drop', instanceId: 'dropoff', kind: 'dropoff', capacity: 1 }], workload: { seed: 3, jobs: 10, arrivalsPerHour: 30, mix: [{ fromStationId: 's-pick', toStationId: 's-drop', share: 1 }] }, objectives: [] } },
  ];
  const committed = await call('/api/scenes/actions', { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash, mutationId: 'isaac-setup', purpose: 'Reference cell', actions });
  expect(committed.status, JSON.stringify(committed.body)).toBe(200);
  const current = await project.snapshot();
  return { call, expected: { sourceRevision: current.sourceRevision, sourceHash: current.sourceHash } };
}
it('adds the deterministic Isaac package to an export preview and refuses an unknown scenario', async () => {
  const h = await host();
  const preview = await h.call('/api/export/preview', { expected: h.expected, selectedEvidenceIds: [], isaac: { sceneId: 'scene-1', scenarioId: 'scenario-1' } });
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  const data = preview.body.data as { members: { path: string; sha256: string }[]; isaac: { mode: string; runnableBadge: boolean; remainingSetup: string[] } };
  const paths = data.members.map(m => m.path);
  for (const name of ['scene.usda', 'scenario.json', 'manifest.json', 'unsupported.json', 'run.py', 'asset-requirements.json']) expect(paths).toContain('isaac/' + name);
  expect(paths.some(p => p.endsWith('.html') || p.endsWith('.yaml'))).toBe(true);
  expect(data.isaac).toMatchObject({ mode: 'runnable-reference', runnableBadge: true, remainingSetup: [] });
  const again = await h.call('/api/export/preview', { expected: h.expected, selectedEvidenceIds: [], isaac: { sceneId: 'scene-1', scenarioId: 'scenario-1' } });
  const hashes = (members: { path: string; sha256: string }[]) => members.filter(m => m.path.startsWith('isaac/')).map(m => m.path + ':' + m.sha256);
  expect(hashes((again.body.data as typeof data).members)).toEqual(hashes(data.members));
  expect((await h.call('/api/export/preview', { expected: h.expected, selectedEvidenceIds: [], isaac: { sceneId: 'scene-1', scenarioId: 'nope' } })).body.error?.code).toBe('RECORD_NOT_FOUND');
  expect((await h.call('/api/export/preview', { expected: h.expected, selectedEvidenceIds: [], isaac: { sceneId: 'scene-1' } })).body.error?.code).toBe('INVALID_INPUT');
  const plain = await h.call('/api/export/preview', { expected: h.expected, selectedEvidenceIds: [] });
  expect((plain.body.data as { members: { path: string }[] }).members.some(m => m.path.startsWith('isaac/'))).toBe(false);
});
