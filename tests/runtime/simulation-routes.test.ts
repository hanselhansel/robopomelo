import { afterEach, expect, it } from 'vitest';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SPATIAL_CAPABILITY, type RobotProfile, type SpatialAction } from '@robopomelo/spec';
import { bundledCatalog, assetRefFor } from '@robopomelo/spatial';
import { startServer } from '../../packages/application/src/server/start.js';
import { ProjectService } from '../../packages/application/src/services/project.js';
import { spatialRoutes } from '../../packages/application/src/server/spatial-routes.js';
import { simulationRoutes } from '../../packages/application/src/simulation/routes.js';
import { inlineStrategy, type ExecuteStrategy } from '../../packages/application/src/simulation/worker.js';
import type { RunDetail, RunStatus } from '../../packages/application/src/simulation/service.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const SLOW_SEED = 99;
/** Seed 99 runs wait for the host to cancel them (so cancel can be observed); everything else runs inline. */
const strategy: ExecuteStrategy = (job, control) => job.input.seed === SLOW_SEED
  ? new Promise((resolve) => control.signal.addEventListener('abort', () => resolve(inlineStrategy(job, { ...control, signal: AbortSignal.abort() }))))
  : inlineStrategy(job, control);
async function host() {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'rp-simulation-routes-')));
  cleanup.push(() => rm(temp, { recursive: true, force: true }));
  const project = new ProjectService({ toolVersion: 'test', configDirectory: join(temp, 'config') });
  await project.create(join(temp, 'project'), 'Routes');
  await project.grant(['author'], 'autonomous', false);
  const server = await startServer({ toolVersion: 'test', routes: [...spatialRoutes(project), ...simulationRoutes(project, { strategy })], onClose: () => project.close() });
  cleanup.push(() => server.close());
  server.setProjectStatus(project.status());
  const boot = await fetch(server.url + '/api/session', { method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: new URL(server.bootstrapUrl).hash.slice(1) }) });
  const session = (await boot.json()).data as { credential: string; csrf: string; projectEpoch: string };
  const call = async <T = unknown,>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(server.url + path, { method, headers: { Authorization: `Bearer ${session.credential}`, 'X-RP-Project-Epoch': session.projectEpoch, 'X-RP-CSRF': session.csrf, Origin: server.url, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: (await response.json()) as { ok: boolean; data?: T; error?: { code: string; message: string } } };
  };
  const commit = async (actions: SpatialAction[], mutationId: string) => {
    const snapshot = await project.snapshot();
    const result = await call('/api/scenes/actions', { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash, mutationId, purpose: mutationId, actions });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
  };
  const runs = async () => (await call<{ runs: RunStatus[] }>('/api/simulation/runs')).body.data!.runs;
  const settled = async (runId: string) => {
    for (let i = 0; i < 200; i++) {
      const status = (await runs()).find((r) => r.runId === runId);
      if (status && status.state !== 'running' && status.state !== 'queued') return status;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`run ${runId} did not settle`);
  };
  return { call, project, commit, runs, settled };
}
const entry = (id: string) => assetRefFor(bundledCatalog().entries.find((e) => e.id === id)!);
const known = <T,>(value: T) => ({ state: 'known' as const, value, sourceIds: [] as string[] });
const profile: RobotProfile = { id: 'profile-differential', drive: 'differential', footprintM: [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]], loadedFootprintM: [[-0.5, -0.4], [0.5, -0.4], [0.5, 0.4], [-0.5, 0.4]], heightM: 0.4, maxSpeedMps: 1, maxAngularRadps: Math.PI, accelerationMps2: 1, decelerationMps2: 1, reverse: false };
function layout(jobs = 3): SpatialAction[] {
  const station = entry('station'), robot = entry('robot-differential'), rack = entry('rack-bay');
  const stationDims = known({ lengthM: 1.5, widthM: 1.5, heightM: 0.02 });
  return [
    { kind: 'activate', capability: SPATIAL_CAPABILITY },
    { kind: 'define-scene', scene: { id: 'scene-1', name: 'Receiving', floor: known({ lengthM: 20, widthM: 12 }) } },
    ...[station, robot, rack].map((asset): SpatialAction => ({ kind: 'register-asset', asset })),
    { kind: 'place', sceneId: 'scene-1', instance: { id: 'pick-1', asset: station, pose: { xM: 4, yM: 6, zM: 0, yawRad: 0 }, dimensions: stationDims, sourceIds: [] } },
    { kind: 'place', sceneId: 'scene-1', instance: { id: 'drop-1', asset: station, pose: { xM: 16, yM: 6, zM: 0, yawRad: 0 }, dimensions: stationDims, sourceIds: [] } },
    { kind: 'place', sceneId: 'scene-1', instance: { id: 'rack-1', asset: rack, pose: { xM: 10, yM: 10, zM: 0, yawRad: 0 }, dimensions: known({ lengthM: 2.7, widthM: 1.1, heightM: 6 }), sourceIds: [] } },
    { kind: 'place', sceneId: 'scene-1', instance: { id: 'robot-1', asset: robot, pose: { xM: 10, yM: 3, zM: 0, yawRad: 0 }, dimensions: known({ lengthM: 0.8, widthM: 0.6, heightM: 0.4 }), sourceIds: [] } },
    { kind: 'define-robot-profile', profile },
    { kind: 'define-scenario', scenario: { id: 'scenario-1', sceneId: 'scene-1', name: 'Base', robotProfileIds: ['profile-differential'], fleetSize: known(1), stations: [{ id: 'pick', instanceId: 'pick-1', kind: 'pickup', capacity: 1 }, { id: 'drop', instanceId: 'drop-1', kind: 'dropoff', capacity: 1 }], workload: { seed: 11, jobs, arrivalsPerHour: 600, mix: [{ fromStationId: 'pick', toStationId: 'drop', share: 1 }] }, objectives: [{ id: 'o-throughput', kind: 'throughput', direction: 'maximize', threshold: 1, unit: 'jobs/h', sourceIds: [] }] } },
  ];
}
it('starts a run from the current source, stores it with source identity, serves bounded events and reuses identical inputs', async () => {
  const h = await host();
  await h.commit(layout(), 'layout-1');
  expect((await h.call('/api/simulation/runs', { scenarioId: 'scenario-1', seed: 0 })).body.error?.code).toBe('INVALID_INPUT');
  expect((await h.call('/api/simulation/runs', { scenarioId: 'scenario-1', seed: 5, limits: { wallMs: 60_001 } })).body.error?.code).toBe('INVALID_INPUT');
  expect((await h.call('/api/simulation/runs', { scenarioId: 'scenario-1', seed: 5, extra: 1 })).body.error?.code).toBe('INVALID_INPUT');
  expect((await h.call('/api/simulation/runs', { scenarioId: 'scenario-9', seed: 5 })).body.error?.code).toBe('RECORD_NOT_FOUND');
  const started = await h.call<RunStatus>('/api/simulation/runs', { scenarioId: 'scenario-1', seed: 5, limits: { wallMs: 4000, maxTicks: 6000 } });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  const status = started.body.data!;
  expect(status.limits).toEqual({ wallMs: 4000, maxTicks: 6000 });
  expect(status.inputHash).toMatch(/^[0-9a-f]{64}$/);
  const snapshot = await h.project.snapshot();
  expect(status.sourceRevision).toBe(snapshot.sourceRevision);
  const done = await h.settled(status.runId);
  expect(done.state).toBe('stored');
  expect(done.termination, JSON.stringify(done)).toBe('completed');
  expect(done.partial).toBe(false);
  expect(done.stale).toBe(false);
  const detail = (await h.call<RunDetail>(`/api/simulation/runs/${status.runId}`)).body.data!;
  expect(detail.manifest).toMatchObject({ formatVersion: '1.0.0', runId: status.runId, sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash, seed: 5, termination: 'completed' });
  expect(detail.manifest.assetHashes.length).toBeGreaterThan(0);
  expect(detail.summary.ledger.completed).toBe(3);
  expect(detail.summary.robots[0]!.legs.length).toBeGreaterThan(0);
  expect(detail.objectives[0]).toMatchObject({ kind: 'throughput', satisfied: true });
  expect(detail.objectives[0]!.measured).toBeGreaterThan(0);
  const window = (await h.call<{ events: unknown[]; total: number; to: number }>(`/api/simulation/runs/${status.runId}/events?from=0&to=2`)).body.data!;
  expect(window.events).toHaveLength(2);
  expect(window.total).toBe(detail.eventCount);
  expect((await h.call(`/api/simulation/runs/${status.runId}/events?from=0&to=5001`)).body.error?.code).toBe('INVALID_INPUT');
  expect((await h.call(`/api/simulation/runs/${status.runId}/events?from=-1`)).body.error?.code).toBe('INVALID_INPUT');
  expect((await h.call(`/api/simulation/runs/${status.runId}/events?from=${detail.eventCount + 5}`)).body.data).toMatchObject({ events: [] });
  expect((await h.call('/api/simulation/runs/nope')).body.error?.code).toBe('RUN_NOT_FOUND');
  const reused = (await h.call<RunStatus>('/api/simulation/runs', { scenarioId: 'scenario-1', seed: 5 })).body.data!;
  expect(reused).toMatchObject({ runId: status.runId, reused: true, state: 'stored', sourceRevision: snapshot.sourceRevision });
  expect(await h.runs()).toHaveLength(1);
});
it('cancels a running job within the termination window and stores it as a partial run', async () => {
  const h = await host();
  await h.commit(layout(), 'layout-1');
  const status = (await h.call<RunStatus>('/api/simulation/runs', { scenarioId: 'scenario-1', seed: SLOW_SEED })).body.data!;
  expect(status.state).toBe('running');
  const t0 = performance.now();
  const cancelled = await h.call<RunStatus>(`/api/simulation/runs/${status.runId}/cancel`, {});
  expect(performance.now() - t0).toBeLessThan(2000);
  expect(cancelled.body.data).toMatchObject({ state: 'stored', termination: 'cancelled', partial: true, stoppedBy: 'cancel' });
  const detail = (await h.call<RunDetail>(`/api/simulation/runs/${status.runId}`)).body.data!;
  expect(detail.summary.metrics.partial).toBe(true);
  expect(detail.objectives[0]!.satisfied).toBeNull();
  expect((await h.call<RunStatus>(`/api/simulation/runs/${status.runId}/cancel`, {})).body.data).toMatchObject({ state: 'stored' }); // idempotent
  expect((await h.call('/api/simulation/runs/unknown-run/cancel', {})).body.error?.code).toBe('RUN_NOT_FOUND');
});
it('marks runs stale after a semantic scene edit but not after a rename, and compares only same-workload runs', async () => {
  const h = await host();
  await h.commit(layout(), 'layout-1');
  const a = (await h.call<RunStatus>('/api/simulation/runs', { scenarioId: 'scenario-1', seed: 5 })).body.data!;
  await h.settled(a.runId);
  const b = (await h.call<RunStatus>('/api/simulation/runs', { scenarioId: 'scenario-1', seed: 6 })).body.data!;
  await h.settled(b.runId);
  await h.commit([{ kind: 'define-scene', scene: { id: 'scene-1', name: 'Receiving (renamed)', floor: known({ lengthM: 20, widthM: 12 }) } }], 'rename');
  expect((await h.runs()).map((r) => r.stale)).toEqual([false, false]);
  const same = await h.call<{ comparable: boolean; preferred: string[] | null; spreads: unknown[] }>('/api/simulation/compare', { baselineRunId: a.runId, alternativeRunIds: [b.runId] });
  expect(same.status, JSON.stringify(same.body)).toBe(200);
  expect(same.body.data!.comparable).toBe(true);
  expect(same.body.data!.spreads).toHaveLength(1); // same variant, two seeds: spread, not one number
  expect((await h.call('/api/simulation/compare', { baselineRunId: a.runId, alternativeRunIds: [a.runId] })).body.error?.code).toBe('INVALID_INPUT');
  await h.commit([{ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 11, yM: 10, zM: 0, yawRad: 0 } }], 'move-rack');
  expect((await h.runs()).map((r) => r.stale)).toEqual([true, true]);
  const detail = (await h.call<RunDetail>(`/api/simulation/runs/${a.runId}`)).body.data!;
  expect(detail.status.stale).toBe(true);
  expect(detail.manifest.sourceRevision).toBe(a.sourceRevision); // original provenance is kept
  // A different workload is a different scenario: comparison refuses it.
  const other = layout(4).find((x) => x.kind === 'define-scenario')!;
  if (other.kind !== 'define-scenario') throw new Error('unexpected');
  await h.commit([{ kind: 'define-scenario', scenario: { ...other.scenario, id: 'scenario-2', name: 'More jobs' } }], 'scenario-2');
  const c = (await h.call<RunStatus>('/api/simulation/runs', { scenarioId: 'scenario-2', seed: 5 })).body.data!;
  await h.settled(c.runId);
  const mismatch = await h.call<{ comparable: boolean; reason: string; mismatched: string[] }>('/api/simulation/compare', { baselineRunId: a.runId, alternativeRunIds: [c.runId] });
  expect(mismatch.body.data).toEqual({ comparable: false, reason: 'WORKLOAD_MISMATCH', mismatched: [c.runId] });
});
