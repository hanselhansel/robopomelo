// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api } from '../src/lib/api.js';
import { SimulationPanel } from '../src/features/simulation/SimulationPanel.js';
import type { Comparison, RunDetail, RunStatus, SimEvent } from '../src/features/simulation/types.js';
import { poseAt } from '../src/features/simulation/poses.js';
import { ScenePanel } from '../src/features/scene/ScenePanel.js';
import { mockSceneServer, stubRenderer } from './scene-fixture.js';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const hex = (c: string) => c.repeat(64);
const status = (runId: string, over: Partial<RunStatus> = {}): RunStatus => ({
  runId, scenarioId: 'scenario-1', state: 'stored', inputHash: hex('1'), workloadHash: hex('2'), variantHash: hex('3'), seed: 5, policyVersion: 'fifo-nearest/1', limits: { wallMs: 60_000, maxTicks: 18_000 },
  sourceRevision: 'rev-1', sourceHash: hex('a'), progressTick: 600, durationTicks: 600, termination: 'completed', partial: false, stale: false, reused: false, stoppedBy: null, error: null, ...over,
});
const events: SimEvent[] = [
  { tick: 0, sequence: 0, robotId: 'robot-1', kind: 'assigned', taskId: 'job-0000', resourceId: 'pick', reason: 'released:0 priority:0' },
  { tick: 1, sequence: 1, robotId: 'robot-1', kind: 'waiting', taskId: 'job-0000', resourceId: 'cell:4,6', reason: 'blocked-by:robot-2' },
  { tick: 30, sequence: 2, robotId: 'robot-1', kind: 'moving', taskId: 'job-0000', resourceId: 'pick', reason: 'depart:30 arrive:100' },
  { tick: 40, sequence: 3, robotId: 'robot-2', kind: 'deadlock', taskId: 'job-0001', resourceId: 'cell:5,6', reason: 'wait-for:robot-1' },
];
const detail = (runId: string, over: Partial<RunStatus> = {}): RunDetail => ({
  status: status(runId, over),
  manifest: { formatVersion: '1.0.0', runId, sourceRevision: 'rev-1', sourceHash: hex('a'), inputHash: hex('1'), workloadHash: hex('2'), assetHashes: [], engineVersion: '1.0.0', policyVersion: 'fifo-nearest/1', seed: 5, durationTicks: 600, termination: over.termination ?? 'completed', eventCount: events.length, eventSha256: hex('e') },
  summary: {
    scenarioId: 'scenario-1', sceneId: 'scene-1', variantHash: hex('3'), limits: { wallMs: 60_000, maxTicks: 18_000 }, policy: { name: 'fifo-nearest', version: '1' },
    metrics: { partial: over.partial ?? false, horizonTicks: 600, completedJobs: 3, failedJobs: 0, throughputPerHour: 180, meanWaitTicks: 20, p95WaitTicks: 30, utilization: { 'robot-1': 0.5, 'robot-2': 0.1 } },
    ledger: { queued: 0, active: 0, completed: 3, failed: 0, cancelled: 0, released: 3 }, unresolved: { robotIds: ['robot-2'], resourceIds: ['cell:5,6'] }, reason: 'all jobs terminal and fleet idle', stoppedBy: null, wallMs: 120, robotsUsed: 2,
    bounds: { minXM: 0, maxXM: 20, minYM: 0, maxYM: 12 }, stations: [{ id: 'pick', kind: 'pickup', pose: { xM: 4, yM: 6, zM: 0, yawRad: 0 } }],
    robots: [{ id: 'robot-1', profileId: 'p', start: { xM: 10, yM: 3, zM: 0, yawRad: 0 }, legs: [[30, 100, 10, 3, 0, 6, 6, Math.PI, 0]] }, { id: 'robot-2', profileId: 'p', start: { xM: 12, yM: 3, zM: 0, yawRad: 0 }, legs: [] }],
    objectives: [],
  },
  objectives: [{ id: 'o', kind: 'throughput', direction: 'maximize', unit: 'jobs/h', measured: 180, threshold: 100, satisfied: over.partial ? null : true }],
  eventCount: events.length,
});
interface Server { runs: RunStatus[]; calls: { path: string; body: unknown }[]; comparison: Comparison }
function mockServer(runs: RunStatus[] = []): Server {
  const server: Server = { runs, calls: [], comparison: { comparable: false, reason: 'WORKLOAD_MISMATCH', mismatched: ['run-b'] } };
  vi.spyOn(api, 'request').mockImplementation(async (path: string, body?: unknown) => {
    server.calls.push({ path, body });
    if (path === '/api/scenes') return { scenes: [], scenarios: [{ id: 'scenario-1', name: 'Base', sceneId: 'scene-1' }], robotProfiles: [], assets: [] };
    if (path === '/api/simulation/runs' && body === undefined) return { runs: server.runs };
    if (path === '/api/simulation/runs') { const run = status('run-new', { state: 'running', progressTick: 0, durationTicks: null, termination: null, partial: null, seed: (body as { seed: number }).seed }); server.runs = [...server.runs, run]; return run; }
    if (path === '/api/simulation/compare') return server.comparison;
    const m = /^\/api\/simulation\/runs\/([^/?]+)(\/events)?/.exec(path);
    if (m && m[2]) return { from: 0, to: events.length, total: events.length, events };
    if (m) { const run = server.runs.find((r) => r.runId === m[1])!; return detail(run.runId, run); }
    throw new Error(`Unexpected call ${path}`);
  });
  return server;
}
const startBodies = (server: Server) => server.calls.filter((c) => c.path === '/api/simulation/runs' && c.body !== undefined).map((c) => c.body);
it('shows editable limits and posts exactly the displayed limits, seed and policy', async () => {
  const server = mockServer();
  render(<SimulationPanel />);
  await screen.findByText('No runs yet. Start one with the limits above.');
  const wall = screen.getByLabelText('Wall time (s)') as HTMLInputElement;
  expect(wall.value).toBe('60');
  expect(wall.max).toBe('60');
  expect(screen.getByTestId('sim-limit-summary').textContent).toContain('60 s of wall time or 18000 ticks');
  fireEvent.change(wall, { target: { value: '120' } });
  fireEvent.blur(wall);
  expect(wall.value).toBe('60'); // cannot exceed the displayed limit
  fireEvent.change(wall, { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('Max ticks'), { target: { value: '1200' } });
  fireEvent.change(screen.getByLabelText('Seed'), { target: { value: '42' } });
  fireEvent.change(screen.getByLabelText('Policy'), { target: { value: 'cost-estimate' } });
  expect(screen.getByTestId('sim-limit-summary').textContent).toContain('20 s of wall time or 1200 ticks (2.0 simulated minutes)');
  fireEvent.click(screen.getByRole('button', { name: 'Start run' }));
  await waitFor(() => expect(startBodies(server)).toHaveLength(1));
  expect(startBodies(server)[0]).toEqual({ scenarioId: 'scenario-1', seed: 42, limits: { wallMs: 20_000, maxTicks: 1200 }, policy: { name: 'cost-estimate', version: '1' } });
  await screen.findByText('Running');
});
it('polls while a run is active and stops once it settles', async () => {
  const server = mockServer([status('run-a', { state: 'running', progressTick: 250, durationTicks: null, termination: null, partial: null })]);
  render(<SimulationPanel pollMs={30} />);
  await screen.findByText('tick 250 of 18000');
  const before = server.calls.filter((c) => c.path === '/api/simulation/runs').length;
  await waitFor(() => expect(server.calls.filter((c) => c.path === '/api/simulation/runs').length).toBeGreaterThan(before + 1));
  server.runs = [status('run-a', { termination: 'budget', partial: true })];
  await screen.findByText('600 ticks');
  expect(screen.getAllByText('Partial').length).toBeGreaterThan(0);
  const settledCalls = server.calls.filter((c) => c.path === '/api/simulation/runs').length;
  await new Promise((r) => setTimeout(r, 120));
  expect(server.calls.filter((c) => c.path === '/api/simulation/runs').length).toBeLessThanOrEqual(settledCalls + 1);
  expect(screen.getByRole('status', { name: 'Simulation status' }).textContent).toContain('finished: budget (partial)');
});
it('labels stale and partial runs and keeps the baseline fixed when a newer run completes', async () => {
  const server = mockServer([status('run-a'), status('run-b', { seed: 6, stale: true, partial: true, termination: 'cancelled', workloadHash: hex('9') })]);
  render(<SimulationPanel />);
  const rows = await screen.findAllByRole('row');
  expect(rows.some((r) => r.textContent?.includes('Stale') && r.textContent.includes('Partial'))).toBe(true);
  const baseline = screen.getByLabelText('Baseline run') as HTMLSelectElement;
  await waitFor(() => expect(baseline.value).toBe('run-a'));
  const alternatives = screen.getByRole('group', { name: 'Alternatives (same workload only)' });
  expect((within(alternatives).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true); // different workload
  expect(within(alternatives).getByText('different workload')).toBeTruthy();
  server.runs = [status('run-c', { seed: 7 }), ...server.runs];
  fireEvent.click(screen.getByRole('button', { name: 'Refresh runs' }));
  await screen.findByText('run-c');
  expect(baseline.value).toBe('run-a'); // never auto-advances
  fireEvent.change(baseline, { target: { value: 'run-c' } });
  expect(baseline.value).toBe('run-c');
  const same = within(alternatives).getAllByRole('checkbox').find((c) => !(c as HTMLInputElement).disabled)!;
  fireEvent.click(same);
  server.comparison = { comparable: true, workloadHash: hex('2'), baseline: { runId: 'run-c', seed: 7, partial: false, stale: false, objectives: [{ id: 'o', kind: 'throughput', direction: 'maximize', unit: 'jobs/h', measured: 180, threshold: 100, satisfied: true }], deltas: [{ id: 'o', kind: 'throughput', delta: 0, better: null }] }, alternatives: [{ runId: 'run-a', seed: 5, partial: false, stale: false, objectives: [{ id: 'o', kind: 'throughput', direction: 'maximize', unit: 'jobs/h', measured: 150, threshold: 100, satisfied: true }], deltas: [{ id: 'o', kind: 'throughput', delta: -30, better: false }] }], preferred: null, undecided: 'OBJECTIVE_TRADEOFF', spreads: [] };
  fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
  await screen.findByText(/objectives disagree; all alternatives are kept/);
  expect(server.calls.find((c) => c.path === '/api/simulation/compare')!.body).toEqual({ baselineRunId: 'run-c', alternativeRunIds: ['run-a'] });
  expect(screen.getByRole('table', { name: 'Objective trade-offs against the baseline' }).textContent).toContain('-30.0');
});
it('opens a stored run, toggles playback with Space only when playback has focus, and shows a robot reason chain', async () => {
  mockServer([status('run-a')]);
  render(<SimulationPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
  const playback = await screen.findByRole('group', { name: 'Playback' });
  const play = within(playback).getByRole('button', { name: 'Play' });
  fireEvent.keyDown(screen.getByLabelText('Seed'), { key: ' ' }); // text input elsewhere: nothing happens
  expect(play.getAttribute('aria-pressed')).toBe('false');
  playback.focus();
  fireEvent.keyDown(playback, { key: ' ' });
  expect(within(playback).getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.keyDown(playback, { key: ' ' });
  expect(within(playback).getByRole('button', { name: 'Play' })).toBeTruthy();
  fireEvent.change(within(playback).getByLabelText('Tick'), { target: { value: '65' } });
  expect(within(playback).getByText(/tick 65 of 600/)).toBeTruthy();
  const mid = poseAt(detail('run-a').summary.robots[0]!, 65);
  expect(mid.moving).toBe(true);
  expect(mid.pose.xM).toBeCloseTo(8, 5);
  expect(mid.pose.yM).toBeCloseTo(4.5, 5);
  fireEvent.click(within(playback).getByRole('option', { name: /robot-1/ }));
  const details = await screen.findByRole('region', { name: 'Robot robot-1' });
  const reasons = within(details).getAllByRole('listitem').map((li) => li.textContent);
  expect(reasons.some((t) => t?.includes('Waiting for cell:4,6, held by robot-2'))).toBe(true);
  expect(reasons.some((t) => t?.includes('Moving to pick, ticks 30 to 100'))).toBe(true);
  fireEvent.click(within(playback).getByRole('option', { name: /robot-2/ }));
  expect((await screen.findByRole('region', { name: 'Robot robot-2' })).textContent).toContain('Deadlock member: unresolved with no other robot over cell:5,6');
});
it('mounts below the scene canvas behind a disclosure and calls the simulation host only once opened', async () => {
  const scene = mockSceneServer();
  type Request = (path: string, body?: unknown, project?: boolean, method?: string) => Promise<unknown>;
  const inner = api.request as unknown as ReturnType<typeof vi.fn<Request>>;
  const original = inner.getMockImplementation()!;
  inner.mockImplementation(async (path, body, project, method) => {
    if (path === '/api/simulation/runs') return { runs: [] };
    return original(path, body, project, method);
  });
  render(<ScenePanel createRenderer={stubRenderer} />);
  await screen.findByRole('option', { name: /rack-1/ });
  const summary = screen.getByText('Fleet simulation', { selector: 'summary' });
  const simulationCalls = () => inner.mock.calls.filter((c) => String(c[0]).startsWith('/api/simulation'));
  expect(simulationCalls()).toHaveLength(0);
  expect(scene.calls.length).toBeGreaterThan(0);
  const details = summary.closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  await screen.findByRole('region', { name: 'Fleet simulation' });
  await waitFor(() => expect(simulationCalls().map((c) => c[0])).toContain('/api/simulation/runs'));
});
