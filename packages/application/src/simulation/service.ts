import { DEFAULT_EXPLORATION_BUDGET, SPATIAL_NAMESPACE, checkSchema, type ExplorationBudget, type Objective, type Pose, type RobotProfile, type Scenario, type Scene, type SpatialExtension } from '@robopomelo/spec';
import { SpatialError, bundledCatalog, catalogEntry, compileScene } from '@robopomelo/spatial';
import { ProjectFsError, RunStore, type RunManifest } from '@robopomelo/project-fs';
import {
  DEFAULT_TOLERANCES, SimulationError, assetHashes, compareRuns, evaluateObjectives, floorBounds, sceneObstacles, semanticInputHash, servicePoses, snapPose, variantHash, workloadHash,
  type Comparison, type FleetInput, type FleetMetrics, type FleetResult, type FleetStation, type LedgerCounts, type ObjectiveEvaluation, type Policy, type RunSummary, type SimEvent, type Termination, type Unresolved,
} from '@robopomelo/simulation';
import type { ProjectService } from '../services/project.js';
import { HttpError } from '../server/security.js';
import { SimulationRunner, type ExecuteStrategy } from './worker.js';

export type RunLimits = { wallMs: number; maxTicks: number };
export const MAX_TICKS_LIMIT = 360_000;
export const DEFAULT_RUN_LIMITS: RunLimits = { wallMs: DEFAULT_EXPLORATION_BUDGET.simulationWallMs, maxTicks: 18_000 };
export const DEFAULT_POLICY: Policy = { name: 'fifo-nearest', version: '1' };
export const EVENT_WINDOW_LIMIT = 5000;
const ROUTE_LIMITS = { maxExpansionsPerRoute: 20_000, replanBudgetPerRobot: 2 };
const CHECKPOINT_EVERY = 1000;
export type StartInput = { scenarioId: string; seed: number; limits?: Partial<RunLimits>; policy?: Policy };
export type RunState = 'queued' | 'running' | 'stored' | 'interrupted' | 'failed' | 'cancelled';
export type RunStatus = {
  runId: string; scenarioId: string | null; state: RunState; inputHash: string | null; workloadHash: string | null; variantHash: string | null; seed: number | null;
  policyVersion: string | null; limits: RunLimits | null; sourceRevision: string | null; sourceHash: string | null; progressTick: number; durationTicks: number | null;
  termination: Termination | null; partial: boolean | null; stale: boolean; reused: boolean; stoppedBy: 'deadline' | 'cancel' | null; error: string | null;
};
/** Bounded per-run summary stored beside the manifest: enough to render playback and compare without the event stream. */
export type RunRecord = {
  scenarioId: string; sceneId: string; variantHash: string; limits: RunLimits; policy: Policy; metrics: FleetMetrics; ledger: LedgerCounts; unresolved: Unresolved | null;
  reason: string; stoppedBy: 'deadline' | 'cancel' | null; wallMs: number; robotsUsed: number; bounds: FleetInput['bounds'];
  stations: { id: string; kind: FleetStation['kind']; pose: Pose }[];
  /** Legs as [departTick, arriveTick, x0, y0, yaw0, x1, y1, yaw1, loaded] so playback interpolates without step data. */
  robots: { id: string; profileId: string; start: Pose; legs: number[][] }[];
  objectives: Objective[];
};
export type RunDetail = { status: RunStatus; manifest: RunManifest; summary: RunRecord; objectives: ObjectiveEvaluation[]; eventCount: number };
type Prepared = { runId: string; input: FleetInput; limits: RunLimits; record: Omit<RunRecord, 'metrics' | 'ledger' | 'unresolved' | 'reason' | 'stoppedBy' | 'wallMs' | 'robotsUsed'> };
type Tracked = { status: RunStatus; prepared: Prepared; runner: SimulationRunner | null; done: Promise<void> | null };
interface ProjectSim { epoch: string; store: RunStore; runs: Map<string, Tracked>; queue: string[] }
export type SimulationServiceOptions = { strategy?: ExecuteStrategy; budget?: ExplorationBudget };

const spatialOf = (deployment: { extensions: Record<string, unknown> }): SpatialExtension | null => {
  const raw = deployment.extensions[SPATIAL_NAMESPACE];
  return raw && !checkSchema(raw, 'spatial').length ? (raw as SpatialExtension) : null;
};
const translate = (error: unknown): never => {
  if (error instanceof SpatialError || error instanceof SimulationError) throw new HttpError(422, error.code, error.message);
  throw error;
};
const compactLegs = (robots: RunRecord['robots'], result: FleetResult): RunRecord['robots'] => robots.map((r) => ({
  ...r,
  legs: (result.robots.find((x) => x.id === r.id)?.legs ?? []).map((leg) => { const to = leg.steps.at(-1)?.pose ?? leg.start.pose; return [leg.departTick, leg.arriveTick, leg.start.pose.xM, leg.start.pose.yM, leg.start.pose.yawRad, to.xM, to.yM, to.yawRad, leg.start.loaded ? 1 : 0]; }),
}));

/** Per-project simulation host. Every run executes from an immutable snapshot
 * of the source at start time, under the exploration budget (workers, queued
 * variants, wall time), and is stored with the exact source identity it came
 * from. Staleness compares each stored run's inputHash with what the current
 * source compiles to for that scenario and seed. */
export class SimulationService {
  readonly budget: ExplorationBudget;
  #sims = new Map<string, ProjectSim>();
  constructor(private readonly project: ProjectService, private readonly options: SimulationServiceOptions = {}) { this.budget = options.budget ?? DEFAULT_EXPLORATION_BUDGET; }
  async #sim(): Promise<ProjectSim> {
    return this.project.withProject(async (selected) => {
      const epoch = this.project.epoch;
      let sim = this.#sims.get(epoch);
      if (!sim) {
        for (const [key, stale] of this.#sims) { for (const t of stale.runs.values()) t.runner?.cancel(); this.#sims.delete(key); }
        sim = { epoch, store: new RunStore(selected.root), runs: new Map(), queue: [] };
        this.#sims.set(epoch, sim);
      }
      return sim;
    });
  }
  async #spatial(): Promise<{ spatial: SpatialExtension; sourceRevision: string; sourceHash: string }> {
    const snapshot = await this.project.snapshot();
    const spatial = spatialOf(snapshot.deployment);
    if (!spatial) throw new HttpError(404, 'RECORD_NOT_FOUND', 'This project has no spatial extension yet.');
    return { spatial, sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash };
  }
  /** Immutable run input from the current source. Robot instances are catalog entries with a robot spec; each maps to the first scenario profile with the same drive. */
  #prepare(spatial: SpatialExtension, scenario: Scenario, scene: Scene, source: { sourceRevision: string; sourceHash: string }, runId: string, seed: number, policy: Policy, limits: RunLimits): Prepared {
    const catalog = bundledCatalog();
    const compiled = compileScene(scene, catalog);
    const named = new Set(scenario.robotProfileIds);
    const profiles = spatial.robotProfiles.filter((p) => named.has(p.id));
    const robotObjects = compiled.objects.filter((o) => o.loadedCollision !== undefined);
    if (!robotObjects.length) throw new HttpError(422, 'NO_ROBOTS', 'Place at least one robot in the scene before simulating.');
    const robots = robotObjects.map((o) => {
      const drive = catalogEntry(catalog, o.assetId, o.assetVersion).robot!.drive;
      const profile: RobotProfile | undefined = profiles.find((p) => p.drive === drive);
      if (!profile) throw new HttpError(422, 'ROBOT_PROFILE_UNRESOLVED', `Robot ${o.instanceId} (${drive}) has no ${drive} profile in scenario ${scenario.id}.`);
      return { id: o.instanceId, profileId: profile.id, pose: snapPose(scene.instances.find((i) => i.id === o.instanceId)!.pose, DEFAULT_TOLERANCES) };
    });
    const obstacles = sceneObstacles(scene, new Set(robots.map((r) => r.id)));
    const bounds = floorBounds(scene);
    const stations = servicePoses(scene, scenario.stations, profiles, obstacles, bounds, DEFAULT_TOLERANCES);
    const hashInput = { compiledScene: compiled, scenario, profiles, policy, seed };
    const identity = { ...source, runId, inputHash: semanticInputHash(hashInput), workloadHash: workloadHash(scenario.workload), assetHashes: assetHashes(scene) };
    const input: FleetInput = { identity, obstacles, bounds, robots, profiles, stations, workload: scenario.workload, policy, seed, tolerances: DEFAULT_TOLERANCES };
    return { runId, input, limits, record: { scenarioId: scenario.id, sceneId: scene.id, variantHash: variantHash(hashInput), limits, policy, bounds, stations: stations.map((s) => ({ id: s.id, kind: s.kind, pose: s.pose })), robots: robots.map((r) => ({ id: r.id, profileId: r.profileId, start: r.pose, legs: [] })), objectives: scenario.objectives } };
  }
  #status(p: Prepared, state: RunState): RunStatus {
    return { runId: p.runId, scenarioId: p.record.scenarioId, state, inputHash: p.input.identity.inputHash, workloadHash: p.input.identity.workloadHash, variantHash: p.record.variantHash, seed: p.input.seed, policyVersion: `${p.input.policy.name}/${p.input.policy.version}`, limits: p.limits, sourceRevision: p.input.identity.sourceRevision, sourceHash: p.input.identity.sourceHash, progressTick: 0, durationTicks: null, termination: null, partial: null, stale: false, reused: false, stoppedBy: null, error: null };
  }
  async start(request: StartInput): Promise<RunStatus> {
    const limits: RunLimits = { ...DEFAULT_RUN_LIMITS, ...request.limits };
    if (!Number.isSafeInteger(limits.wallMs) || limits.wallMs < 1 || limits.wallMs > this.budget.simulationWallMs) throw new HttpError(400, 'INVALID_INPUT', `Wall time must be between 1 and ${this.budget.simulationWallMs} ms.`);
    if (!Number.isSafeInteger(limits.maxTicks) || limits.maxTicks < 1 || limits.maxTicks > MAX_TICKS_LIMIT) throw new HttpError(400, 'INVALID_INPUT', `Max ticks must be between 1 and ${MAX_TICKS_LIMIT}.`);
    if (!Number.isSafeInteger(request.seed) || request.seed < 1 || request.seed > 0xffffffff) throw new HttpError(400, 'INVALID_INPUT', 'Seed must be a 32-bit positive integer.');
    const sim = await this.#sim();
    const { spatial, ...source } = await this.#spatial();
    const scenario = spatial.scenarios.find((s) => s.id === request.scenarioId);
    if (!scenario) throw new HttpError(404, 'RECORD_NOT_FOUND', 'That scenario does not exist in this project.');
    const scene = spatial.scenes.find((s) => s.id === scenario.sceneId);
    if (!scene) throw new HttpError(422, 'REFERENCE_INVALID', `Scenario ${scenario.id} references a missing scene.`);
    const runId = this.project.id().toLowerCase();
    let prepared: Prepared;
    try { prepared = this.#prepare(spatial, scenario, scene, source, runId, request.seed, request.policy ?? DEFAULT_POLICY, limits); } catch (error) { return translate(error); }
    const hash = prepared.input.identity.inputHash;
    for (const tracked of sim.runs.values()) if (tracked.status.inputHash === hash && tracked.status.state !== 'failed' && tracked.status.state !== 'cancelled') return { ...tracked.status, reused: true };
    for (const listing of await sim.store.list()) if (listing.manifest && listing.manifest.inputHash === hash) return { ...(await this.#storedStatus(sim, listing.runId, listing.manifest, new Map([[scenario.id, hash]]))), reused: true };
    const running = [...sim.runs.values()].filter((t) => t.status.state === 'running').length;
    const tracked: Tracked = { status: this.#status(prepared, 'queued'), prepared, runner: null, done: null };
    sim.runs.set(runId, tracked);
    if (running < this.budget.workers) this.#launch(sim, tracked);
    else if (sim.queue.length < this.budget.variants) sim.queue.push(runId);
    else { sim.runs.delete(runId); throw new HttpError(429, 'BUDGET_REACHED', `The exploration budget allows ${this.budget.workers} concurrent runs and ${this.budget.variants} queued variants. Cancel or wait for a run before starting another.`); }
    return { ...tracked.status };
  }
  #launch(sim: ProjectSim, tracked: Tracked): void {
    const runner = new SimulationRunner(this.options.strategy ? { strategy: this.options.strategy } : {});
    tracked.runner = runner;
    tracked.status.state = 'running';
    let checkpoints: Promise<unknown> = Promise.resolve(), lastCheckpoint = 0;
    const { runId, input, limits, record } = tracked.prepared;
    const onProgress = (tick: number) => {
      tracked.status.progressTick = tick;
      if (tick - lastCheckpoint < CHECKPOINT_EVERY) return;
      lastCheckpoint = tick;
      checkpoints = checkpoints.then(() => sim.store.checkpoint({ runId, tick, state: { inputHash: input.identity.inputHash, sourceRevision: input.identity.sourceRevision } })).catch(() => undefined);
    };
    tracked.done = runner.run({ input, limits: { maxTicks: limits.maxTicks, ...ROUTE_LIMITS }, wallMs: limits.wallMs }, onProgress).then(async ({ result, stoppedBy, wallMs }) => {
      await checkpoints;
      const summary: RunRecord = { ...record, metrics: result.metrics, ledger: result.ledger, unresolved: result.unresolved, reason: result.reason, stoppedBy, wallMs: Math.round(wallMs), robotsUsed: result.robots.length, robots: compactLegs(record.robots, result) };
      await sim.store.write(result.manifest, result.events, summary);
      Object.assign(tracked.status, { state: 'stored', durationTicks: result.manifest.durationTicks, termination: result.termination, partial: result.metrics.partial, stoppedBy, progressTick: result.manifest.durationTicks });
    }).catch((error: unknown) => {
      Object.assign(tracked.status, { state: 'failed', error: (error as { code?: string }).code ?? 'RUN_FAILED', stoppedBy: runner.stopRequested });
    }).finally(() => {
      tracked.runner = null;
      const next = sim.queue.shift();
      const queued = next ? sim.runs.get(next) : undefined;
      if (queued && queued.status.state === 'queued') this.#launch(sim, queued);
    });
  }
  async cancel(runId: string): Promise<RunStatus> {
    const sim = await this.#sim();
    const tracked = sim.runs.get(runId);
    if (!tracked) throw new HttpError(404, 'RUN_NOT_FOUND', 'That run is not queued or running.');
    if (tracked.status.state === 'queued') { sim.queue = sim.queue.filter((id) => id !== runId); tracked.status.state = 'cancelled'; return { ...tracked.status }; }
    if (tracked.status.state === 'running') { tracked.runner?.cancel(); await tracked.done; }
    return { ...tracked.status };
  }
  /** Current semantic input hash per scenario for the given seeds; null when the scenario no longer compiles. */
  #currentHash(spatial: SpatialExtension | null, cache: Map<string, string | null>, scenarioId: string, seed: number): string | null {
    const key = `${scenarioId}:${seed}`;
    if (cache.has(key)) return cache.get(key)!;
    let hash: string | null = null;
    const scenario = spatial?.scenarios.find((s) => s.id === scenarioId), scene = scenario ? spatial?.scenes.find((s) => s.id === scenario.sceneId) : undefined;
    if (spatial && scenario && scene) {
      try {
        const named = new Set(scenario.robotProfileIds);
        hash = semanticInputHash({ compiledScene: compileScene(scene, bundledCatalog()), scenario, profiles: spatial.robotProfiles.filter((p) => named.has(p.id)), policy: DEFAULT_POLICY, seed });
      } catch { hash = null; }
    }
    cache.set(key, hash);
    return hash;
  }
  async #storedStatus(sim: ProjectSim, runId: string, manifest: RunManifest, current: Map<string, string | null>, spatial: SpatialExtension | null = null): Promise<RunStatus> {
    const record = (await sim.store.summary(runId)) as RunRecord;
    const currentHash = current.has(record.scenarioId) ? current.get(record.scenarioId)! : this.#currentHash(spatial, current, record.scenarioId, manifest.seed);
    return {
      runId, scenarioId: record.scenarioId, state: 'stored', inputHash: manifest.inputHash, workloadHash: manifest.workloadHash, variantHash: record.variantHash, seed: manifest.seed, policyVersion: manifest.policyVersion,
      limits: record.limits, sourceRevision: manifest.sourceRevision, sourceHash: manifest.sourceHash, progressTick: manifest.durationTicks, durationTicks: manifest.durationTicks, termination: manifest.termination,
      partial: record.metrics.partial, stale: RunStore.staleAgainst(manifest, currentHash), reused: false, stoppedBy: record.stoppedBy, error: null,
    };
  }
  async list(): Promise<RunStatus[]> {
    const sim = await this.#sim();
    let spatial: SpatialExtension | null = null;
    try { spatial = (await this.#spatial()).spatial; } catch (error) { if (!(error instanceof HttpError) && !(error instanceof ProjectFsError)) throw error; }
    const cache = new Map<string, string | null>();
    const out: RunStatus[] = [];
    for (const listing of await sim.store.list()) {
      if (listing.manifest) out.push(await this.#storedStatus(sim, listing.runId, listing.manifest, cache, spatial));
      else if (!sim.runs.has(listing.runId)) out.push({ ...this.#empty(listing.runId), state: listing.status === 'damaged' ? 'failed' : 'interrupted', progressTick: listing.lastCheckpointTick ?? 0, error: listing.status === 'damaged' ? 'RUN_DAMAGED' : null });
    }
    for (const tracked of sim.runs.values()) if (tracked.status.state !== 'stored') out.push({ ...tracked.status });
    return out;
  }
  #empty(runId: string): RunStatus {
    return { runId, scenarioId: null, state: 'interrupted', inputHash: null, workloadHash: null, variantHash: null, seed: null, policyVersion: null, limits: null, sourceRevision: null, sourceHash: null, progressTick: 0, durationTicks: null, termination: null, partial: null, stale: true, reused: false, stoppedBy: null, error: null };
  }
  async read(runId: string): Promise<RunDetail> {
    const sim = await this.#sim();
    const stored = await sim.store.read(runId);
    const summary = stored.summary as RunRecord;
    let spatial: SpatialExtension | null = null;
    try { spatial = (await this.#spatial()).spatial; } catch (error) { if (!(error instanceof HttpError) && !(error instanceof ProjectFsError)) throw error; }
    const status = await this.#storedStatus(sim, runId, stored.manifest, new Map(), spatial);
    const objectives = spatial?.scenarios.find((s) => s.id === summary.scenarioId)?.objectives ?? summary.objectives;
    let evaluated: ObjectiveEvaluation[];
    try { evaluated = evaluateObjectives(objectives, summary.metrics, { partial: summary.metrics.partial, robotsUsed: summary.robotsUsed, cost: null }); } catch (error) { return translate(error); }
    return { status, manifest: stored.manifest, summary, objectives: evaluated, eventCount: stored.events.length };
  }
  async events(runId: string, from: number, to: number): Promise<{ from: number; to: number; total: number; events: SimEvent[] }> {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) throw new HttpError(400, 'INVALID_INPUT', 'Supply a non-negative event window.');
    if (to - from > EVENT_WINDOW_LIMIT) throw new HttpError(400, 'INVALID_INPUT', `Request at most ${EVENT_WINDOW_LIMIT} events per window.`);
    const sim = await this.#sim();
    const stored = await sim.store.read(runId);
    return { from, to: Math.min(to, stored.events.length), total: stored.events.length, events: (stored.events as SimEvent[]).slice(from, to) };
  }
  async compare(request: { baselineRunId: string; alternativeRunIds: string[] }): Promise<Comparison> {
    const baseline = await this.read(request.baselineRunId);
    const alternatives = await Promise.all(request.alternativeRunIds.map((id) => this.read(id)));
    const summary = (d: RunDetail): RunSummary => ({ runId: d.status.runId, inputHash: d.manifest.inputHash, workloadHash: d.manifest.workloadHash, variantHash: d.summary.variantHash, seed: d.manifest.seed, partial: d.summary.metrics.partial, stale: d.status.stale, metrics: d.summary.metrics, robotsUsed: d.summary.robotsUsed, cost: null });
    const objectives = baseline.objectives.map((o) => ({ id: o.id, kind: o.kind, direction: o.direction, threshold: o.threshold, unit: o.unit, sourceIds: [] as string[] }));
    try { return compareRuns(summary(baseline), alternatives.map(summary), objectives); } catch (error) { return translate(error); }
  }
  async close(): Promise<void> {
    for (const sim of this.#sims.values()) for (const t of sim.runs.values()) { t.runner?.cancel(); await t.done?.catch(() => undefined); }
    this.#sims.clear();
  }
}
