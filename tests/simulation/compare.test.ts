import { describe, expect, it } from 'vitest';
import type { Instance, Objective, RobotProfile, Scenario, Scene } from '@robopomelo/spec';
import { assetRefFor, bundledCatalog, compileScene } from '@robopomelo/spatial';
import { compareRuns, type RunSummary } from '../../packages/simulation/src/compare.js';
import type { FleetMetrics } from '../../packages/simulation/src/fleet-types.js';
import { assetHashes, semanticInputHash, variantHash, workloadHash } from '../../packages/simulation/src/input-hash.js';
import { evaluateObjectives, validateObjectiveDefinitions } from '../../packages/simulation/src/objectives.js';
import { diff } from './fleet-helpers.js';

const metrics = (over: Partial<FleetMetrics> = {}): FleetMetrics => ({ partial: false, horizonTicks: 36_000, completedJobs: 100, failedJobs: 0, throughputPerHour: 100, meanWaitTicks: 100, p95WaitTicks: 300, utilization: { r1: 0.5 }, ...over });
const run = (runId: string, over: Partial<RunSummary> = {}): RunSummary => ({ runId, inputHash: `in-${runId}`, workloadHash: 'wl', variantHash: `v-${runId}`, seed: 1, partial: false, stale: false, metrics: metrics(), robotsUsed: 4, ...over });
const objective = (kind: Objective['kind'], direction: Objective['direction'], threshold: number | null = null): Objective => ({ id: `o-${kind}`, kind, direction, threshold, unit: kind === 'throughput' ? 'jobs/h' : kind === 'max-wait' ? 's' : kind, sourceIds: [] });

describe('objectives', () => {
  it('measures throughput, fleet count and p95 wait in seconds and never fabricates cost', () => {
    const out = evaluateObjectives([objective('throughput', 'maximize', 90), objective('fleet-count', 'minimize', 3), objective('max-wait', 'minimize', 60), objective('cost', 'minimize', 10)], metrics(), { partial: false, robotsUsed: 4 });
    expect(out.map((o) => [o.measured, o.satisfied])).toEqual([[100, true], [4, false], [30, true], [null, null]]);
    const withCost = evaluateObjectives([objective('cost', 'minimize', 10)], metrics(), { partial: false, robotsUsed: 4, cost: 8 });
    expect(withCost[0]).toMatchObject({ measured: 8, satisfied: true });
  });
  it('leaves satisfaction open for partial runs and missing thresholds', () => {
    const partial = evaluateObjectives([objective('throughput', 'maximize', 90)], metrics({ partial: true }), { partial: true, robotsUsed: 4 });
    expect(partial[0]).toMatchObject({ measured: 100, satisfied: null });
    expect(evaluateObjectives([objective('throughput', 'maximize')], metrics(), { partial: false, robotsUsed: 4 })[0]!.satisfied).toBeNull();
    expect(evaluateObjectives([objective('max-wait', 'minimize', 60)], metrics({ p95WaitTicks: null }), { partial: false, robotsUsed: 4 })[0]).toMatchObject({ measured: null, satisfied: null });
  });
  it('rejects one kind pulled in two directions and duplicate ids', () => {
    expect(() => validateObjectiveDefinitions([objective('throughput', 'maximize'), { ...objective('throughput', 'minimize'), id: 'o-2' }])).toThrow(/OBJECTIVE_CONFLICT|both maximized/);
    expect(() => validateObjectiveDefinitions([objective('throughput', 'maximize'), objective('throughput', 'maximize')])).toThrow(/defined twice/);
    expect(() => validateObjectiveDefinitions([objective('throughput', 'maximize', Number.NaN)])).toThrow(/finite/);
  });
});

describe('compareRuns', () => {
  const fast = run('fast', { metrics: metrics({ throughputPerHour: 120, p95WaitTicks: 900 }) });
  const calm = run('calm', { metrics: metrics({ throughputPerHour: 90, p95WaitTicks: 200 }) });
  it('refuses runs whose workload differs', () => {
    expect(compareRuns(fast, [run('other', { workloadHash: 'different' })], [objective('throughput', 'maximize')])).toEqual({ comparable: false, reason: 'WORKLOAD_MISMATCH', mismatched: ['other'] });
  });
  it('reports per-objective deltas against a fixed baseline', () => {
    const out = compareRuns(fast, [calm], [objective('throughput', 'maximize'), objective('max-wait', 'minimize')]);
    if (!out.comparable) throw new Error('expected comparable');
    expect(out.baseline.runId).toBe('fast');
    expect(out.alternatives[0]!.deltas).toEqual([
      { id: 'o-throughput', kind: 'throughput', delta: -30, better: false },
      { id: 'o-max-wait', kind: 'max-wait', delta: -70, better: true },
    ]);
  });
  it('reverses preference when the priority reverses and refuses to pick when priorities conflict', () => {
    const byThroughput = compareRuns(fast, [calm], [objective('throughput', 'maximize')]);
    const byWait = compareRuns(fast, [calm], [objective('max-wait', 'minimize')]);
    const both = compareRuns(fast, [calm], [objective('throughput', 'maximize'), objective('max-wait', 'minimize')]);
    expect(byThroughput.comparable && byThroughput.preferred).toEqual(['fast']);
    expect(byWait.comparable && byWait.preferred).toEqual(['calm']);
    if (!both.comparable) throw new Error('expected comparable');
    expect(both.preferred).toBeNull();
    expect(both.undecided).toBe('OBJECTIVE_TRADEOFF');
    expect(both.alternatives.map((a) => a.runId)).toEqual(['calm']);
  });
  it('treats missing cost as unmeasured, not zero, and then declines to prefer', () => {
    const out = compareRuns(fast, [calm], [objective('cost', 'minimize')]);
    if (!out.comparable) throw new Error('expected comparable');
    expect(out.baseline.objectives[0]!.measured).toBeNull();
    expect(out.alternatives[0]!.deltas[0]).toEqual({ id: 'o-cost', kind: 'cost', delta: null, better: null });
    expect(out.preferred).toBeNull();
    expect(out.undecided).toBe('UNMEASURED');
  });
  it('labels partial runs and never lets them win', () => {
    const cut = run('cut', { partial: true, metrics: metrics({ partial: true, throughputPerHour: 500 }) });
    const out = compareRuns(fast, [cut], [objective('throughput', 'maximize')]);
    if (!out.comparable) throw new Error('expected comparable');
    expect(out.alternatives[0]!.partial).toBe(true);
    expect(out.alternatives[0]!.objectives[0]!.satisfied).toBeNull();
    expect(out.preferred).toEqual(['fast']);
    const onlyPartial = compareRuns(cut, [], [objective('throughput', 'maximize')]);
    expect(onlyPartial.comparable && onlyPartial.undecided).toBe('NO_COMPLETE_RUN');
  });
  it('reports the spread of repeated seeds of one variant and ranks by the whole spread', () => {
    const a1 = run('a1', { variantHash: 'A', seed: 1, metrics: metrics({ throughputPerHour: 100 }) });
    const a2 = run('a2', { variantHash: 'A', seed: 2, metrics: metrics({ throughputPerHour: 130 }) });
    const b1 = run('b1', { variantHash: 'B', seed: 1, metrics: metrics({ throughputPerHour: 110 }) });
    const out = compareRuns(a1, [a2, b1], [objective('throughput', 'maximize')]);
    if (!out.comparable) throw new Error('expected comparable');
    expect(out.spreads).toEqual([{ variantHash: 'A', runIds: ['a1', 'a2'], seeds: [1, 2], objectives: [{ id: 'o-throughput', kind: 'throughput', min: 100, max: 130 }] }]);
    // B (110) sits inside A's spread (100..130): neither variant beats the other outright, so both remain.
    expect(out.preferred).toEqual(['a1', 'a2', 'b1']);
    const b2 = run('b2', { variantHash: 'B', seed: 1, metrics: metrics({ throughputPerHour: 140 }) });
    const decided = compareRuns(a1, [a2, b2], [objective('throughput', 'maximize')]);
    expect(decided.comparable && decided.preferred).toEqual(['b2']);
  });
});

describe('semantic input hash', () => {
  const catalog = bundledCatalog();
  const rack = assetRefFor(catalog.entries.find((e) => e.id === 'rack-bay')!), robot = assetRefFor(catalog.entries.find((e) => e.id === 'robot-differential')!), stationAsset = assetRefFor(catalog.entries.find((e) => e.id === 'station')!);
  const known = <T,>(value: T) => ({ state: 'known' as const, value, sourceIds: ['plan'] });
  const instance = (id: string, asset: typeof rack, xM: number, dims: { lengthM: number; widthM: number; heightM: number }): Instance => ({ id, asset, pose: { xM, yM: 2, zM: 0, yawRad: 0 }, dimensions: known(dims), sourceIds: ['plan'] });
  const scene = (): Scene => ({ id: 'scene-1', name: 'Receiving', floor: known({ lengthM: 20, widthM: 12 }), instances: [instance('rack-1', rack, 3, { lengthM: 2.7, widthM: 1.1, heightM: 6 }), instance('st-1', stationAsset, 10, { lengthM: 1.5, widthM: 1, heightM: 0.02 }), instance('robot-1', robot, 6, { lengthM: 0.8, widthM: 0.6, heightM: 0.4 })] });
  const profiles: RobotProfile[] = [diff({ id: 'profile-differential' })];
  const scenario = (): Scenario => ({ id: 'scenario-1', sceneId: 'scene-1', name: 'Base', robotProfileIds: ['profile-differential'], fleetSize: known(1), stations: [{ id: 'pick', instanceId: 'st-1', kind: 'pickup', capacity: 1 }], workload: { seed: 7, jobs: 5, arrivalsPerHour: 60, mix: [{ fromStationId: 'pick', toStationId: 'pick', share: 1 }] }, objectives: [] });
  const hash = (s: Scene, sc: Scenario = scenario(), seed = 3) => semanticInputHash({ compiledScene: compileScene(s, catalog), scenario: sc, profiles, policy: { name: 'fifo-nearest', version: '1' }, seed });
  it('ignores cosmetic edits: scene name, scenario name, source ids, objectives, instance ids', () => {
    const base = hash(scene());
    expect(hash({ ...scene(), name: 'Renamed' })).toBe(base);
    expect(hash(scene(), { ...scenario(), name: 'Renamed scenario', objectives: [{ id: 'o', kind: 'throughput', direction: 'maximize', threshold: 5, unit: 'jobs/h', sourceIds: [] }] })).toBe(base);
    const renamedInstance: Scene = { ...scene(), instances: scene().instances.map((i) => (i.id === 'st-1' ? { ...i, id: 'station-renamed', sourceIds: [] } : i)) };
    expect(hash(renamedInstance, { ...scenario(), stations: [{ id: 'pick', instanceId: 'station-renamed', kind: 'pickup', capacity: 1 }] })).toBe(base);
  });
  it('changes with moves, footprints, workload, profiles, policy, tuning and seed', () => {
    const base = hash(scene());
    const moved: Scene = { ...scene(), instances: scene().instances.map((i) => (i.id === 'rack-1' ? { ...i, pose: { ...i.pose, xM: 4 } } : i)) };
    const resized: Scene = { ...scene(), instances: scene().instances.map((i) => (i.id === 'rack-1' ? { ...i, dimensions: known({ lengthM: 3.6, widthM: 1.1, heightM: 6 }) } : i)) };
    expect(hash(moved)).not.toBe(base);
    expect(hash(resized)).not.toBe(base);
    expect(hash(scene(), { ...scenario(), workload: { ...scenario().workload!, jobs: 6 } })).not.toBe(base);
    expect(hash(scene(), scenario(), 4)).not.toBe(base);
    expect(hash(scene(), { ...scenario(), stations: [{ id: 'pick', instanceId: 'st-1', kind: 'pickup', capacity: 2 }] })).not.toBe(base);
    const compiled = compileScene(scene(), catalog);
    const v = (over: Record<string, unknown>) => variantHash({ compiledScene: compiled, scenario: scenario(), profiles, policy: { name: 'fifo-nearest', version: '1' }, ...over });
    expect(v({ policy: { name: 'cost-estimate', version: '1' } })).not.toBe(v({}));
    expect(v({ tuning: { serviceTicks: 3 } })).not.toBe(v({}));
    expect(v({ profiles: [diff({ id: 'profile-differential', maxSpeedMps: 2 })] })).not.toBe(v({}));
    // The seed is not part of the variant identity, so repeats group together.
    expect(v({})).toBe(v({}));
  });
  it('hashes workloads canonically and lists sorted unique asset hashes', () => {
    const w = scenario().workload!;
    expect(workloadHash(w)).toBe(workloadHash({ mix: w.mix, arrivalsPerHour: 60, jobs: 5, seed: 7 }));
    expect(workloadHash(null)).toMatch(/^[0-9a-f]{64}$/);
    expect(assetHashes(scene())).toEqual([...new Set([rack.sha256, stationAsset.sha256, robot.sha256])].sort());
  });
});
