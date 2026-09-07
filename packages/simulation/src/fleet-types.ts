import type { Pose, RobotProfile, Station, Workload } from '@robopomelo/spec';
import type { Bounds } from './route.js';
import type { PathStep, RobotState, StaticObstacle, Tick, Tolerances } from './types.js';
import type { JobSpec, LedgerCounts } from './jobs.js';

/** Bump when event semantics, reservation rules or scheduling change. */
export const ENGINE_VERSION = '1.0.0';

export type SimEventKind = 'assigned' | 'moving' | 'waiting' | 'loading' | 'completed' | 'deadlock';
/** Event record. `kind: 'completed'` means the task reached a terminal state; the
 * reason is `completed` on success or `failed:<CODE>` on failure. `moving` reasons
 * carry `depart:<tick> arrive:<tick>`, `loading` reasons carry `until:<tick>`, so
 * metrics can be derived from events alone. */
export type SimEvent = {
  tick: Tick; sequence: number; robotId: string; kind: SimEventKind;
  taskId: string | null; resourceId: string | null; reason: string;
};
export type Termination = 'completed' | 'cancelled' | 'budget' | 'deadlock' | 'invalid';
/** Identity fields the host computes (hashes, ids); the engine echoes them. */
export type RunIdentity = { sourceRevision: string; sourceHash: string; runId: string; inputHash: string; workloadHash: string; assetHashes: string[] };
export type RunManifest = RunIdentity & {
  formatVersion: '1.0.0'; engineVersion: string; policyVersion: string; seed: number;
  durationTicks: Tick; termination: Termination; eventCount: number; eventSha256: string;
};

export type PolicyName = 'fifo-nearest' | 'cost-estimate';
/** Policy is a versioned input; the manifest records `${name}/${version}`. */
export type Policy = { name: PolicyName; version: string };
/** Station plus the lattice service pose where a robot stands to use it. */
export type FleetStation = Station & { pose: Pose };
export type FleetRobot = { id: string; profileId: string; pose: Pose; lowBattery?: boolean };
/** Scheduling knobs. All are versioned inputs, none is hidden tuning. */
export type FleetTuning = {
  /** Ticks a robot spends at a station for a load/unload/charge/hold stop. */
  serviceTicks: number;
  /** Ticks between planning retries of a blocked robot. */
  retryTicks: number;
  /** Waiting ticks per +1 of effective priority (aging against starvation). */
  agingTicks: number;
  /** Ticks a robot stays blocked before it spends replanning budget (replan around standing robots, retreat). */
  patienceTicks: number;
  /** Maximum whole-plan time shifts while searching a conflict-free start tick. */
  maxShifts: number;
  /** Corridor margin around start/goal used to bound a route search before falling back to the full floor. */
  routeMarginM: number;
  /** Weighted A* factor passed to findRoute (1 = exact). */
  heuristicWeight: number;
  /** Expansion cap for escape searches (around standing robots, retreats); the job route keeps the full limit. */
  escapeExpansions: number;
};
export const DEFAULT_TUNING: FleetTuning = { serviceTicks: 20, retryTicks: 10, agingTicks: 600, patienceTicks: 30, maxShifts: 32, routeMarginM: 12, heuristicWeight: 1.25, escapeExpansions: 5000 };

export type FleetInput = {
  identity: RunIdentity;
  obstacles: readonly StaticObstacle[];
  bounds: Bounds;
  robots: readonly FleetRobot[];
  profiles: readonly RobotProfile[];
  stations: readonly FleetStation[];
  /** Seeded job release source; ignored when `jobs` is given explicitly. */
  workload: Workload | null;
  jobs?: readonly JobSpec[];
  policy: Policy;
  /** Run seed recorded in the manifest (32-bit positive integer). Job release itself is
   * driven by `workload.seed`, which is part of the workload's identity. */
  seed: number;
  tolerances?: Tolerances;
  tuning?: Partial<FleetTuning>;
};
export type FleetLimits = {
  maxTicks: Tick;
  maxExpansionsPerRoute: number;
  replanBudgetPerRobot: number;
  /** Host-owned cancellation; the engine never reads wall-clock time. */
  shouldStop?: () => boolean;
};

/** One committed route: the state at departure and the absolute-tick steps. */
export type LegRecord = { start: RobotState; steps: PathStep[]; departTick: Tick; arriveTick: Tick; taskId: string | null };
export type RobotReport = { id: string; profileId: string; finalPose: Pose; loaded: boolean; legs: LegRecord[] };
export type Unresolved = { robotIds: string[]; resourceIds: string[] };
export type FleetMetrics = {
  partial: boolean; horizonTicks: Tick; completedJobs: number; failedJobs: number; throughputPerHour: number;
  meanWaitTicks: number | null; p95WaitTicks: number | null; utilization: Record<string, number>;
};
export type FleetResult = {
  manifest: RunManifest; events: SimEvent[]; ledger: LedgerCounts; metrics: FleetMetrics;
  unresolved: Unresolved | null; robots: RobotReport[]; termination: Termination; reason: string;
};
