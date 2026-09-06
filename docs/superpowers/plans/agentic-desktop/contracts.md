# Agentic desktop contracts and failure semantics

This is a normative engineering supplement to the [implementation plan](../2026-09-07-agentic-desktop.md). New types below belong to `packages/spec/src/agent.ts`, `spatial.ts`, `simulation.ts` and `desktop.ts`, split under 400 lines each. All message entry points validate equivalent closed JSON Schemas before dispatch.

## Source and action identity

```ts
export type SourceBase = { sourceRevision: string; sourceHash: string };
export type RunKey = { runId: string; generation: number };
export type Pose = { xM: number; yM: number; zM: number; yawRad: number };
export type Knowledge<T> =
  | { state: 'known'; value: T; sourceIds: string[] }
  | { state: 'unverified'; value: T; sourceIds: string[] }
  | { state: 'unknown'; reason: string }
  | { state: 'not-applicable'; reason: string };
export type AssetRef = { id: string; version: string; sha256: string };
export type Instance = {
  id: string; asset: AssetRef; pose: Pose;
  dimensions: Knowledge<{ lengthM: number; widthM: number; heightM: number }>;
  sourceIds: string[];
};
export type SpatialAction =
  | { kind: 'place'; instance: Instance }
  | { kind: 'move'; id: string; pose: Pose }
  | { kind: 'resize'; id: string; dimensions: Instance['dimensions'] }
  | { kind: 'remove'; id: string; replacementId: string | null };
export type SpatialEnvelope = SourceBase & {
  mutationId: string; purpose: string; actions: SpatialAction[];
};
```

Units are canonical meters/seconds/radians; UI preserves supplied display units and conversions. Coordinates right-handed Z-up. Reject NaN, infinity, zero/negative extents, duplicate IDs, unknown assets, unsupported asset versions and invalid reference IDs. Every semantic action has a source base and idempotency key. Changing runtime grants or review decisions is not a SpatialAction.

The full extension also contains scenario definitions, typed stations/queue slots, lane resources, robot profiles, task batches and objectives. Relationships are IDs, never pointers into a renderer object. Actual extension schema lives in `packages/spec/schemas/spatial-1.0.0.schema.json`; its root has required formatVersion/scenes/scenarios and additionalProperties:false. Mixed supported capability requires `robopomelo.capabilities.required` to include `spatial-planning-v1` atomically with first spatial write.

Every user/AI-derived simulation value has an explicit field-level binding. Define `RequirementBinding { id, subjectId, sourceIds, target:{ scenarioId, recordId, field }, transform:'identity'|'unit-conversion'|'assumption', rationale, knowledgeState, confirmedAtRevision }` in spatial.ts. Target field is an enumerated semantic field (geometry extent, robot limit, task arrival/handling duration, objective threshold), not arbitrary JSONPath. Resolve the actual source value and transformation from validated records; no unconstrained executable expressions. A source edit marks linked derived values stale and invalidates only corresponding simulation-input hashes. Unknown/contradictory sources cannot become confirmed fields. User overrides create a new binding/rationale rather than erasing provenance. Test the full incomplete-notes/floor-plan -> fact -> geometry/workload/objective -> run -> corrected-fact path and prove unrelated bindings remain unchanged.

Assets live under `assets/sha256/<digest>/`; verified original bytes cannot be replaced by an instance parameter edit. Source extents and loaded collision polygons are independent of decorative mesh scale. Result trajectories are stored under `runs/<runId>/`, not within the 8MiB YAML source.

## Provider and discovery boundary

```ts
export type ConnectionModel = {
  connectionId: string; route: 'openrouter' | 'codex' | 'grok';
  modelId: string; label: string; efforts: string[];
  inputKinds: ('text' | 'image')[];
  structuredActions: boolean; cancellation: boolean;
};
export type Question = {
  id: string; subjectIds: string[]; prompt: string;
  choices: { id: string; label: string }[]; why: string;
};
export type AgentReply = {
  summary: string; question: Question | null;
  proposedActions: unknown[]; citedSourceIds: string[];
};
export type DiscoveryRequest = SourceBase & RunKey & {
  connectionId: string; modelId: string; effort: string | null;
  context: string; maxOutputTokens: number;
};
export interface ProviderAdapter {
  models(signal: AbortSignal): Promise<ConnectionModel[]>;
  propose(request: DiscoveryRequest, signal: AbortSignal): Promise<AgentReply>;
}
export type AgentEvent = RunKey & {
  sequence: number; kind: 'progress' | 'question' | 'proposed' | 'error' | 'stopped';
  text: string;
};
```

`unknown[]` is deliberately untrusted until a closed union schema decodes it. The orchestrator converts only valid ordinary authoring and spatial actions to existing core mutations. Provider output cannot choose its own grant, actor authority, root, destination, idempotency key or source revision.

One active question per project conversation; replacement is explicit by question ID and run generation. Answer correlation includes the prior question ID so an old button cannot answer a new question. Keep locally selected pending attachments through OAuth cancellation. Follow-up context contains validated records, relevant source excerpts and unresolved subjects, not raw entire transcripts/meshes.

```ts
export function acceptEvent(current: RunKey, event: AgentEvent, last: number): boolean {
  return event.runId === current.runId && event.generation === current.generation &&
    event.sequence > last;
}
export type ExplorationBudget = {
  modelTurns: number; maxOutputTokens: number;
  simulationWallMs: number; variants: number; workers: number;
};
export function reserveTurn(remaining: number): number {
  if (!Number.isSafeInteger(remaining) || remaining <= 0) throw new Error('BUDGET_REACHED');
  return remaining - 1;
}
```

Reserve limits before dispatch; retries consume budgets unless no request was sent. Cancellation increments generation synchronously, aborts network, cancels workers and invalidates pending apply actions. Active provider requests can still incur usage already accepted by the provider; never promise retroactive refunds. Resuming creates a new explicit run on the current source base, not reuse of a cancelled callback.

## Research confidentiality

The public research service receives `ResearchTopic { sector, process, environment, questionClass }` from a curated enum schema. It assembles reviewed generic query templates without injecting project names, narrative, file excerpts, URLs or model-proposed free text. Custom queries are previewed and approved separately. Source retrieval is content-only through an allowlisted research transport with redirect/SSRF/size limits, no cookies or native shell. Model-native web tools are off for confidential sessions until equivalently enforceable isolation exists.

This reduces automatic query expressiveness intentionally. The model can still reason over chosen private context through the selected provider grant; public search is a separate audience. Regex/LLM redaction alone cannot establish this boundary.

## Native desktop boundary

`apps/desktop/src/main.ts` owns BrowserWindow lifetime, validated navigation, native dialogs, credential encryption and app updates. Preload exposes specific methods, never ipcRenderer itself:

```ts
export type PickedFolder = { selectionId: string; displayPath: string };
export interface DesktopBridge {
  chooseProjectFolder(mode: 'create' | 'open'): Promise<PickedFolder | null>;
  selectAttachments(): Promise<{ selectionId: string; name: string; bytes: number }[]>;
  confirmSetup(selectionId: string, presetId: 'recommended' | 'inspection'): Promise<void>;
  cancelRun(runId: string): Promise<void>;
}
```

Main retains actual file paths behind short-lived selection IDs. Confirm verifies sender WebContents/main frame, active selection, root identity and displayed grant payload. Set nodeIntegration:false, contextIsolation:true, sandbox:true, webSecurity:true. Deny popups, new windows and permission requests by default. Open only exact supported OAuth destinations in the system browser after validating the generated URL. OAuth callback checks state+PKCE, binds connection/attempt, consumes once, rejects expiry and releases listener on cancel.

Reuse current loopback HTTP service for renderer application requests initially, pinned to its exact origin and session token. Preload capability does not expose general network fetch. Provider keys remain in Electron main, protected with safeStorage encryption backed by Keychain; non-secret connection metadata may reach the service. Disable renderer outbound destinations and network-capable asset resolution. Service calls model APIs through a narrow broker; no key in renderer, logs, process arguments or project exports.

Provider-owned account credential storage is a distinct issue: validate the pinned CLI's native storage and dedicated home, do not label plaintext CLI auth storage as Keychain-backed. G1 must resolve that behavior before advertising the account adapter.

## Simulation contract

```ts
export type Drive = 'differential' | 'omnidirectional';
export type RobotProfile = {
  id: string; drive: Drive; footprintM: [number, number][];
  loadedFootprintM: [number, number][]; heightM: number;
  maxSpeedMps: number; maxAngularRadps: number;
  accelerationMps2: number; decelerationMps2: number; reverse: boolean;
};
export type SimEvent = {
  tick: number; sequence: number; robotId: string;
  kind: 'assigned' | 'moving' | 'waiting' | 'loading' | 'completed' | 'deadlock';
  taskId: string | null; resourceId: string | null; reason: string;
};
export type RunManifest = SourceBase & {
  formatVersion: '1.0.0'; runId: string; inputHash: string; workloadHash: string;
  assetHashes: string[]; engineVersion: string; policyVersion: string;
  seed: number; durationTicks: number;
  termination: 'completed' | 'cancelled' | 'budget' | 'deadlock' | 'invalid';
  eventCount: number; eventSha256: string;
};
```

Use integer ticks and deterministic PRNG/tie ordering. Continuous pose geometry is sampled with conservative swept-volume bounds; endpoint-only collision checks are forbidden. Footprint, drive origin offset, loading state, height intervals and exit availability affect route feasibility. Differential robots may rotate only if their loaded swept footprint is clear. Quantization/tolerances are versioned inputs, not hidden tuning.

Reservation keys include resource and interval, opposite edge transitions and swept occupied area. Release after the full footprint leaves. A wait-for graph explains deadlock. Stable priority plus aging prevents starvation; bounded replanning can backtrack only to a verified holding pose permitted by the profile. Failure emits unresolved state and retains uncompleted tasks.

An independent trace checker revalidates output collisions and task conservation. Every job is in exactly one of queued, active, completed, failed or cancelled; counts sum to released jobs. A partial run never claims a full-horizon objective score. Repeated stochastic demand compares multiple named seeds using identical workloads and reports spread, not false precision.

## Failure and rescue registry

| Code/path | Trigger | Rescue and visible result |
|---|---|---|
| PICK_CANCELLED | User closes native dialog | Keep intake buffer; no root grant |
| AUTH_CANCELLED/EXPIRED | OAuth cancelled, callback stale | Clear pending listener; preserve draft; explicit reconnect |
| PROVIDER_CAPABILITY | Missing schema/cancel/confinement | Disable adapter-dependent action with exact reason |
| PROVIDER_RATE_LIMIT |429 | Bounded backoff in same route; one-click fallback unless pre-authorized |
| PROVIDER_EMPTY/REFUSAL/SCHEMA | Empty, refused, malformed response | Distinct message; no mutation; bounded retry only where meaningful |
| SOURCE_CONFLICT | Manual edit beats AI reply | Reject stale base; preserve proposed changes and compare |
| OUTCOME_UNKNOWN | Response lost after durable mutation | Existing receipt/idempotency recovery; no new mutation key |
| INPUT_UNSUPPORTED | PDF password, CAD or damaged bytes | Retain file; explain extracted/unsupported parts |
| INPUT_LIMIT | File/page/mesh/source exceeds limits | Reject before expensive decode; preserve other files |
| RESEARCH_PRIVATE_QUERY | Free-text query not approved | Show proposed query for one-time review |
| ASSET_INVALID/MISSING | Hash/geometry/version mismatch | Block affected simulation/export; keep scene editable |
| SIM_INFEASIBLE/DEADLOCK | Exhausted bounded route/coordination search | Show exact affected jobs/resources, limits and partial results |
| BUDGET_REACHED | Reserved limit exhausted | Pause; persist checkpoints; ask only to increase budget |
| ISAAC_UNAVAILABLE | Unsupported runtime/GPU/asset pack | Export compatibility report and clear prerequisites |
| UPDATE_INVALID | Bad signature/channel/provenance | Keep current signed app; no migration |

For missing input, keep state explicitly unknown. Present-but-empty input has its own validation result. Exceptions produce named typed errors; no generic catch-and-proceed path may report success. Application diagnostic logs contain IDs/timing/codes, never full model context, files, credentials or OAuth query strings. Project conversation files are explicit portable user data, not telemetry.

## States and four paths

```text
intake -> folder-selected -> grant-confirmed -> connected -> drafting -> ready-to-review
  |cancel       |cancel            |revoke        |disconnect      |edit
  +-> retained draft <-------------+--------------+                +-> drafting

run idle -> reserved -> running -> completed
                         |-> cancelled / budget / failed (terminal generation)
callback on old generation -> ignored, never apply

happy: input -> closed schema -> typed action -> source transaction -> revision/event
nil:   missing answer -> unknown -> next material question -> no fabricated value
empty: zero-length file / no tasks -> explicit empty state -> no fabricated simulation
error: parse/auth/conflict/timeout -> named rescue -> retained draft + actionable result
```

Other invalid transitions, such as callback-after-cancel, apply-without-grant, completion-without-receipt and success-with-unfinished-jobs, are forbidden by broker/core checks and explicit tests in the task files.
