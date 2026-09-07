import type { Objective, ObjectiveKind, Pose, Scenario } from '@robopomelo/spec';
/** Local mirrors of the shapes served by /api/simulation/*. The web package
 * cannot import @robopomelo/simulation or @robopomelo/application, so these are
 * kept in step by hand with packages/application/src/simulation/service.ts and
 * packages/simulation/src/{fleet-types,objectives,compare}.ts. */
export type Termination = 'completed' | 'cancelled' | 'budget' | 'deadlock' | 'invalid';
export type RunState = 'queued' | 'running' | 'stored' | 'interrupted' | 'failed' | 'cancelled';
export type RunLimits = { wallMs: number; maxTicks: number };
export type Policy = { name: 'fifo-nearest' | 'cost-estimate'; version: string };
export interface RunStatus {
  runId: string; scenarioId: string | null; state: RunState; inputHash: string | null; workloadHash: string | null; variantHash: string | null; seed: number | null;
  policyVersion: string | null; limits: RunLimits | null; sourceRevision: string | null; sourceHash: string | null; progressTick: number; durationTicks: number | null;
  termination: Termination | null; partial: boolean | null; stale: boolean; reused: boolean; stoppedBy: 'deadline' | 'cancel' | null; error: string | null;
}
export interface SimEvent { tick: number; sequence: number; robotId: string; kind: 'assigned' | 'moving' | 'waiting' | 'loading' | 'completed' | 'deadlock'; taskId: string | null; resourceId: string | null; reason: string }
export interface FleetMetrics { partial: boolean; horizonTicks: number; completedJobs: number; failedJobs: number; throughputPerHour: number; meanWaitTicks: number | null; p95WaitTicks: number | null; utilization: Record<string, number> }
export interface RunRobot { id: string; profileId: string; start: Pose; legs: number[][] }
export interface RunRecord {
  scenarioId: string; sceneId: string; variantHash: string; limits: RunLimits; policy: Policy; metrics: FleetMetrics;
  ledger: { queued: number; active: number; completed: number; failed: number; cancelled: number; released: number };
  unresolved: { robotIds: string[]; resourceIds: string[] } | null; reason: string; stoppedBy: 'deadline' | 'cancel' | null; wallMs: number; robotsUsed: number;
  bounds: { minXM: number; maxXM: number; minYM: number; maxYM: number }; stations: { id: string; kind: string; pose: Pose }[]; robots: RunRobot[]; objectives: Objective[];
}
export interface ObjectiveEvaluation { id: string; kind: ObjectiveKind; direction: Objective['direction']; unit: string; measured: number | null; threshold: number | null; satisfied: boolean | null }
export interface RunManifest { formatVersion: '1.0.0'; runId: string; sourceRevision: string; sourceHash: string; inputHash: string; workloadHash: string; assetHashes: string[]; engineVersion: string; policyVersion: string; seed: number; durationTicks: number; termination: Termination; eventCount: number; eventSha256: string }
export interface RunDetail { status: RunStatus; manifest: RunManifest; summary: RunRecord; objectives: ObjectiveEvaluation[]; eventCount: number }
export interface EventWindow { from: number; to: number; total: number; events: SimEvent[] }
export interface ComparedRun { runId: string; seed: number; partial: boolean; stale: boolean; objectives: ObjectiveEvaluation[]; deltas: { id: string; kind: ObjectiveKind; delta: number | null; better: boolean | null }[] }
export type Comparison =
  | { comparable: false; reason: 'WORKLOAD_MISMATCH'; mismatched: string[] }
  | { comparable: true; workloadHash: string; baseline: ComparedRun; alternatives: ComparedRun[]; preferred: string[] | null; undecided: 'OBJECTIVE_TRADEOFF' | 'UNMEASURED' | 'NO_COMPLETE_RUN' | 'NO_OBJECTIVES' | null; spreads: { variantHash: string; runIds: string[]; seeds: number[]; objectives: { id: string; kind: ObjectiveKind; min: number | null; max: number | null }[] }[] };
export interface StartBody { scenarioId: string; seed: number; limits: RunLimits; policy: Policy }
export type ScenarioSummary = Pick<Scenario, 'id' | 'name' | 'sceneId'>;
export const TICK_MS = 100;
export const WALL_MS_LIMIT = 60_000;
export const MAX_TICKS_LIMIT = 360_000;
export const DEFAULT_LIMITS: RunLimits = { wallMs: 60_000, maxTicks: 18_000 };
export const DEFAULT_POLICY: Policy = { name: 'fifo-nearest', version: '1' };
export const ACTIVE_STATES = new Set<RunState>(['queued', 'running']);
