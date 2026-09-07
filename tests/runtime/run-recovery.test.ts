import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, realpath, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
import { RunStore, RUN_EVENT_LIMIT } from '../../packages/project-fs/src/runs/store.js';
import { eventSha256, validateRunManifest, type RunManifest } from '../../packages/project-fs/src/runs/manifest.js';
import { SimulationRunner, inlineStrategy, type ExecuteStrategy } from '../../packages/application/src/simulation/worker.js';
import type { FleetInput } from '../../packages/simulation/src/fleet-types.js';
import { LIMITS, box, diff, identity, job, omni, policy, pose, station, TOL, conserved } from '../simulation/fleet-helpers.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function store() {
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'rp-runs-')));
  cleanup.push(() => rm(folder, { recursive: true, force: true }));
  const root = await SafeRoot.open(folder);
  cleanup.push(() => root.close());
  return { folder, root, store: new RunStore(root) };
}
const hex = (c: string) => c.repeat(64);
const events = [{ tick: 0, sequence: 0, robotId: 'r1', kind: 'assigned', taskId: 'j1', resourceId: 'pick', reason: 'released:0 priority:0' }, { tick: 5, sequence: 1, robotId: 'r1', kind: 'completed', taskId: 'j1', resourceId: 'drop', reason: 'completed' }];
const manifest = (over: Partial<RunManifest> = {}): RunManifest => ({
  formatVersion: '1.0.0', runId: 'run-1', sourceRevision: 'rev-1', sourceHash: hex('a'), inputHash: hex('b'), workloadHash: hex('c'), assetHashes: [hex('d')],
  engineVersion: '1.0.0', policyVersion: 'fifo-nearest/1', seed: 7, durationTicks: 6, termination: 'completed', eventCount: events.length, eventSha256: eventSha256(events), ...over,
});
it('validates the closed manifest contract', () => {
  expect(validateRunManifest(manifest())).toEqual(manifest());
  expect(() => validateRunManifest({ ...manifest(), extra: 1 })).toThrow(/exactly the contract fields/);
  expect(() => validateRunManifest(manifest({ inputHash: 'short' }))).toThrow(/sha256/);
  expect(() => validateRunManifest(manifest({ seed: 0 }))).toThrow(/32-bit/);
  expect(() => validateRunManifest(manifest({ durationTicks: 1.5 }))).toThrow(/integers/);
  expect(() => validateRunManifest(manifest({ termination: 'done' as never }))).toThrow(/termination/);
  expect(() => validateRunManifest(manifest({ runId: 'Bad Id' }))).toThrow(/slug/);
});
it('stores a complete run immutably, lists it and re-verifies the event digest on read', async () => {
  const s = await store();
  await s.store.write(manifest(), events, { metrics: { completedJobs: 1 } });
  await s.store.write(manifest(), events, { metrics: { completedJobs: 1 } }); // identical retry is accepted
  await expect(s.store.write(manifest(), events, { metrics: { completedJobs: 2 } })).rejects.toMatchObject({ code: 'HISTORY_TAMPERED' });
  await expect(s.store.write(manifest({ eventCount: 5 }), events, {})).rejects.toMatchObject({ code: 'RUN_MANIFEST_INVALID' });
  await expect(s.store.write(manifest({ runId: 'run-2', eventSha256: hex('e') }), events, {})).rejects.toMatchObject({ code: 'RUN_MANIFEST_INVALID' });
  expect(await s.store.list()).toEqual([{ runId: 'run-1', status: 'complete', manifest: manifest(), lastCheckpointTick: null }]);
  const read = await s.store.read('run-1');
  expect(read.events).toEqual(events);
  expect(read.summary).toEqual({ metrics: { completedJobs: 1 } });
  expect(RunStore.staleAgainst(read.manifest, hex('b'))).toBe(false);
  expect(RunStore.staleAgainst(read.manifest, hex('f'))).toBe(true);
  await expect(s.store.read('run-9')).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });
});
it('lists a run interrupted after its second checkpoint as partial with that tick', async () => {
  const s = await store();
  await s.store.checkpoint({ runId: 'run-2', tick: 100, state: { released: 3 } });
  await s.store.checkpoint({ runId: 'run-2', tick: 200, state: { released: 5 } });
  // Crash before events.json/manifest.json: only checkpoints exist.
  expect(await s.store.list()).toEqual([{ runId: 'run-2', status: 'partial', manifest: null, lastCheckpointTick: 200 }]);
  expect(await s.store.lastCheckpoint('run-2')).toEqual({ runId: 'run-2', tick: 200, state: { released: 5 } });
  await expect(s.store.read('run-2')).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });
  // A checkpoint rewrite at the same tick replaces atomically; a damaged later checkpoint falls back to the previous one.
  await s.store.checkpoint({ runId: 'run-2', tick: 200, state: { released: 6 } });
  await writeFile(join(s.folder, 'runs', 'run-2', 'checkpoint-300.json'), '{"value":{"runId":"run-2","tick":300},"checksum":"nope"}');
  expect(await s.store.lastCheckpoint('run-2')).toEqual({ runId: 'run-2', tick: 200, state: { released: 6 } });
});
it('rejects events that no longer match the manifest digest', async () => {
  const s = await store();
  await s.store.write(manifest(), events, {});
  const path = join(s.folder, 'runs', 'run-1', 'events.json');
  await writeFile(path, JSON.stringify([events[0], { ...events[1], reason: 'failed:FORGED' }]));
  await expect(s.store.read('run-1')).rejects.toMatchObject({ code: 'RUN_TAMPERED' });
  expect((await s.store.list())[0]!.status).toBe('complete'); // the manifest itself is intact; read is what refuses
});
it('rejects a manifest edited to claim a different source revision', async () => {
  const s = await store();
  await s.store.write(manifest(), events, {});
  const path = join(s.folder, 'runs', 'run-1', 'manifest.json');
  const text = (await readFile(path)).toString('utf8');
  expect(text).toContain('"rev-1"');
  await writeFile(path, text.replace('"rev-1"', '"rev-2"')); // checksum inside the file no longer matches
  await expect(s.store.read('run-1')).rejects.toMatchObject({ code: 'STORAGE_INVALID' });
  expect((await s.store.list())[0]).toMatchObject({ runId: 'run-1', status: 'damaged', manifest: null });
});
it('bounds the retained event array', async () => {
  const s = await store();
  const many = Array.from({ length: RUN_EVENT_LIMIT + 1 }, (_, i) => ({ tick: i, sequence: i, robotId: 'r', kind: 'waiting', taskId: null, resourceId: null, reason: '' }));
  await expect(s.store.write(manifest({ eventCount: many.length, eventSha256: eventSha256(many) }), many, {})).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
});

/** Corridor scenario: one robot, two stations, a handful of jobs (generous fixture for cancellation). */
const corridorInput = (jobs: number): FleetInput => ({
  identity, obstacles: [box('wall-n', 0, 30, 2.5, 3), box('wall-s', 0, 30, -1, -0.5)], bounds: { minXM: 0, maxXM: 30, minYM: -1, maxYM: 3 },
  robots: [{ id: 'r1', profileId: 'diff', pose: pose(1, 1) }, { id: 'r2', profileId: 'omni', pose: pose(1, 2) }], profiles: [diff(), omni()],
  stations: [station('pick', 'pickup', pose(10, 1)), station('drop', 'dropoff', pose(25, 1)), station('hold-1', 'holding', pose(1, 1)), station('hold-2', 'holding', pose(1, 2))],
  workload: null, jobs: Array.from({ length: jobs }, (_, i) => job(`j${i}`, i * 5, 'pick', 'drop')), policy, seed: 7, tolerances: TOL, tuning: { serviceTicks: 5, retryTicks: 5 },
});
it('stops an inline run at the host wall deadline and returns a partial result that retains open jobs', async () => {
  let now = 0;
  const runner = new SimulationRunner({ strategy: inlineStrategy, now: () => (now += 5) });
  const outcome = await runner.run({ input: corridorInput(40), limits: { ...LIMITS, maxTicks: 100_000 }, wallMs: 200 });
  expect(outcome.stoppedBy).toBe('deadline');
  expect(outcome.result.termination).toBe('cancelled');
  expect(outcome.result.metrics.partial).toBe(true);
  conserved(outcome.result);
  expect(outcome.result.ledger.cancelled + outcome.result.ledger.queued + outcome.result.ledger.active).toBeGreaterThan(0);
  expect(outcome.result.ledger.released).toBeGreaterThan(0);
  expect(outcome.result.manifest.durationTicks).toBeLessThan(100_000);
});
it('completes a short inline run untouched by the deadline', async () => {
  const runner = new SimulationRunner({ strategy: inlineStrategy });
  const outcome = await runner.run({ input: corridorInput(2), limits: LIMITS, wallMs: 60_000 });
  expect(outcome.stoppedBy).toBeNull();
  expect(outcome.result.termination).toBe('completed');
  expect(outcome.wallMs).toBeGreaterThanOrEqual(0);
});
it('cancel() asks the strategy to stop and the runner gives up on it after two seconds', async () => {
  const stopped: boolean[] = [];
  const slow: ExecuteStrategy = (job, control) => new Promise((resolve) => {
    control.signal.addEventListener('abort', () => { stopped.push(true); resolve(inlineStrategy(job, { ...control, signal: AbortSignal.abort() })); });
  });
  const runner = new SimulationRunner({ strategy: slow });
  const pending = runner.run({ input: corridorInput(3), limits: LIMITS, wallMs: 60_000 });
  await new Promise((r) => setTimeout(r, 10));
  const t0 = performance.now();
  runner.cancel();
  const outcome = await pending;
  expect(performance.now() - t0).toBeLessThan(2000);
  expect(stopped).toEqual([true]);
  expect(outcome.stoppedBy).toBe('cancel');
  expect(outcome.result.termination).toBe('cancelled');
  const hung: ExecuteStrategy = () => new Promise(() => {});
  const stuck = new SimulationRunner({ strategy: hung, terminateMs: 20 });
  const hungRun = stuck.run({ input: corridorInput(1), limits: LIMITS, wallMs: 60_000 });
  stuck.cancel();
  await expect(hungRun).rejects.toMatchObject({ code: 'WORKER_UNRESPONSIVE' });
});
