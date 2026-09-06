# Agentic Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Use relevant TDD, security, design review and QA skills. At most three agents including the coordinator; delegate only independent work.

**Goal:** Deliver the approved macOS discovery/scene/fleet experience and one tested runnable Isaac Sim handoff without replacing existing project safety or evidence contracts.

**Architecture:** Electron hosts the existing React application and a bundled Node service; both desktop and CLI share the same extracted application service and deterministic core. Provider subprocesses return structured proposals to a bounded orchestrator. Pure spatial and simulation packages generate versioned results; the target exporter generates a fixed, inspectable Isaac integration package.

**Tech Stack:** TypeScript, React/Vite, Electron with a sandboxed renderer, existing Ajv/YAML/transaction packages, Three.js rendering, deterministic TypeScript worker simulation, PDF.js for local PDF extraction, OpenRouter HTTPS, Codex app-server and feasibility-gated Grok ACP/headless adapters. Isaac Sim 6.0.0 on Ubuntu 24.04 x86_64 is the proposed external reference runtime.

Status: engineering plan reviewed through sequential product, design, DX and engineering passes with user-authorized Devin CLI outside reviews. Hansel authorized end-to-end implementation on2026-09-07. Product design and engineering choices are approved. Checkboxes and evidence records below track actual implementation; approval is not proof that integration gates passed. Exact new dependency pins are selected by the registry/license/security check in task D1, not guessed from remembered releases.

## Execution order and review target

Read the [approved product design](../specs/2026-09-07-agentic-desktop-design.md), [contracts and architecture](agentic-desktop/contracts.md), [desktop/discovery tasks](agentic-desktop/desktop-agent.md), [spatial/simulation tasks](agentic-desktop/spatial-simulation.md), [release and validation tasks](agentic-desktop/release-validation.md) and [review record](agentic-desktop/review.md).

The [interface/lifecycle/compatibility supplement](agentic-desktop/interfaces.md) defines the CLI/API surface and contribution manifests; its assigned tasks are mandatory parts of the corresponding subplans.

Execute integrated checkpoints: C1 = D1-D4+A1+A3+A4 (native intake -> question -> traceable draft); C2 = S1+S2+S2b+S3+S4 (fact -> editable scene -> one run); C3 = A5+S2a+S5+S6 (reusable template ->50-robot alternatives); C4 = R1-R3+R5 (target execution -> second-engineer continuation); C5 = R4 (release). D0 and A2 account-adapter proofs can progress independently without delaying the first OpenRouter-backed checkpoint; requested account connections still need acceptance before full delivery. Each checkpoint runs a short retained usability/continuation test before the next expands. Tasks have red-test, minimal implementation, verification and explicit-path commit steps; completing one is not completion of the iteration.

Use `/Users/hansel/conductor/repos/robopomelo/.worktrees/v1`, branch `chore/agentic-desktop-design`, for planning only. Implementation begins on a fresh `feat/agentic-desktop` branch/worktree at the reviewed plan commit. Released canonical main is `cafb7409e6e653ea504e0087612e66fac37842a8`; verify live main again before creating the implementation worktree. No reset/stash/force or direct main commits.

Shell toolchain for existing tests:

```sh
export PATH=/Users/hansel/.cache/robopomelo-build/node-v24.20.0-darwin-arm64/bin:$PATH
npm ci --ignore-scripts
npm run typecheck
npm run test:tooling
npm run test:coverage
```

These commands are test instructions, not claims that new-code checks have run. Reuse fresh fingerprint-bound baseline evidence when applicable. Do not rerun product suites for documentation-only changes.

## Existing implementation to reuse

| Need | Existing files | Planned use |
|---|---|---|
| Source transactions, replay and recovery | `packages/project-fs/src/session.ts`, `transactions/prepare.ts`, `commit.ts`, `receipts.ts` | One write path for manual, agent and scene actions |
| Trust and scope | `packages/project-fs/src/settings/trust.ts`, `packages/core/src/permissions.ts` | Root-bound authoring grant plus separately modeled AI destinations |
| Validation and approvals | `packages/core/src/validation.ts`, `mutation-common.ts`, `review-validity.ts` | Preserve RP blockers and approval invalidation |
| Data contracts | `packages/spec/src/patch.ts`, `deployment.ts`, `capabilities.ts` | Add typed capabilities/actions; preserve old projects |
| Runtime application | `apps/cli/src/server/`, `apps/cli/src/services/` | Extract to shared application package, keep CLI compatibility facades |
| Frontend API and drafting | `apps/web/src/lib/api.ts`, `lib/draft.ts`, `Workspace.tsx` | Preserve receipts, drafts and conflict behavior behind desktop transport |
| Evidence and export | `packages/project-fs/src/evidence/`, `export/` | Add explicit immutable asset/run member types |
| Example | `examples/inbound-pallet/deployment.yaml` | Discovery fixture, not observed customer data |
| Identity and updates | `apps/cli/src/runtime/`, `scripts/verify-release.mjs`, `promote-release.mjs` | Keep standalone CLI distribution separate from signed desktop updates |

Observed gaps: root extension edits are absent from PatchOperation; extension references are skipped by core reference/evidence traversal; new packages would currently evade the boundary check because unknown owners are ignored. Add explicit coverage for each, rather than a generic arbitrary-JSON escape. `project-fs/package.json` declares an absent barrel; the existing CLI uses relative imports. Create/test a real curated service boundary during extraction rather than relying on that export accidentally resolving.

## Architecture decision and alternatives

| Approach | Effort / risk | Reuse and trade-off | Decision |
|---|---|---|---|
| Enhance browser-only npx | M / medium | Maximum reuse, weaker native folder/credential/distribution experience; does not fulfill approved desktop goal | Reject as primary, retain CLI path |
| Electron + extracted shared Node service | L / medium | Reuses TS core and React, consistent Chromium; larger binary and privileged main process require isolation | Recommended |
| Tauri + Node sidecar | L-XL / medium-high | Smaller webview host, but adds Rust/sidecar lifecycle and dual runtime delivery around existing Node code | Defer; reconsider only if measured package size blocks adoption |

Effort is relative, not a delivery-date promise. A mature planning simulator and runnable target proof are not a one-day feature, even with agents. No extra paid infrastructure is provisioned by this plan.

```text
React scene/chat/document (sandboxed, no Node or remote code)
  -> typed preload bridge -> Electron main (identity/picker/credential broker)
  -> shared application service -> ProjectSession -> YAML + immutable files
                             |-> agent orchestrator -> provider connection
                             |-> public-topic research broker -> public search
                             |-> simulation worker -> events + measurements
                             |-> export plan -> confined package writer
CLI/Skills ------------------^  same core actions and validation
```

Electron utility processes are process separation, NOT an OS sandbox. Only trusted application code runs there. Untrusted PDF parsing and arbitrary imported/generated code require the separately sandboxed/limited paths in D3 and S2. Keep provider-native shell/file/web capabilities disabled or the adapter unavailable.

Enforced dependency map: spec -> none; spatial -> spec; core -> spec,spatial; simulation -> spec,spatial; project-fs -> spec,core,spatial; artifacts -> spec,core,spatial; providers -> spec; agent -> spec,core; ingestion -> spec; isaac-export -> spec,spatial; application -> spec,core,project-fs,artifacts,providers,agent,spatial,simulation,ingestion,isaac-export; desktop -> application,spec; cli -> application,spec,core,project-fs,artifacts; web -> spec,spatial. Pure packages and web may not import Node/Electron/network APIs. Desktop preload exposes only DTOs, with a separate import deny rule. Unknown owners hard-fail. This map is implemented and tested in D1/D2, with pure spatial geometry depending on spec only to avoid a core/spatial cycle.

## Firm engineering defaults proposed for approval

1. Keep schema `specVersion: 1.0.0` initially with `extensions['robopomelo.spatial']` format `1.0.0` and required capability `spatial-planning-v1`. Task S1 proves released-v1 rejection of editing/approval and visible export limitations. If that fails, stop for a backed-up format migration decision; do not silently rely on an unknown-extension warning.
2. New conversation/run contracts have independent formatVersion and are portable local project files. Machine grants and encrypted provider credentials remain outside project/export.
3. Use Three.js WebGL rendering and instanced catalog meshes. Kinematic simulation runs in a worker; no full physics engine or per-robot LLM calls in the local planning layer.
4. Start with differential and omnidirectional drive profiles. Unsupported steering is an explicit limitation, not a silently approximated parameter.
5. Default exploration: at most 3 variants, 2 simulation workers, 60 seconds wall-clock simulation work and 4 model turns per exploration; cap each model response at 4,096 tokens where supported. Visible controls permit deeper runs. These are proposed product limits to tune against the benchmark, not observed performance. Stop before an unmetered next turn when a connection cannot enforce the declared limit.
6. Native web search is disabled for account agents initially. The research broker receives only enumerated public topics derived from a user-visible research brief. Free-form confidential project context cannot flow into search; custom queries get a one-time review, not automatic regex-based claims of redaction.
7. Existing ordinary project writes use the current author grant. Model sending/research/import/generated-asset scopes have their own explicit broker checks; do not silently add them to an old remembered grant.
8. First local scene target: 100m x 100m, 50 robots, 500 placed catalog objects and 1,000 jobs over 30 simulated minutes. Larger inputs reject visibly with a stated limit in this release. Benchmark expansion is a later decision, not silent degradation.

## Dependency and environment gates

| Gate | Needed before | Required evidence | Status at planning |
|---|---|---|---|
| G0 product/plan review | Product code | Approved product spec and reviewed task plan | Product and engineering plan approved |
| G1 account-adapter containment | Advertise Codex/Grok integration | Pinned protocol, no ambient hooks/files/network, cancellation, fake-secret canaries | Not run; Grok macOS limitations documented |
| G2 old-reader compatibility | New source writes | Actual npm v1 open/edit/approve/export matrix with spatial capability required | Not run |
| G3 desktop architecture performance | Commit renderer/simulator scale promises | Named M4 / 24 GiB development machine measured baseline; supported Intel target tested separately | Hardware known; new benchmark not run |
| G4 Isaac runtime | Claim runnable handoff | RTX-compatible Ubuntu24.04 runner, driver, Isaac6.0.0 and licensed asset pack; real controller execution | No compatible runner established |
| G5 signed distribution | Publish desktop installer/update | Developer ID/notarization authority and clean-machine install/update proof | Availability not established |

G1-G5 do not prevent writing independent tested code after plan approval, but block their dependent acceptance claims. No core scope is silently dropped if an external gate fails. Do not make the user repeatedly authenticate during planning; dedicated adapter acceptance is scheduled when its software is ready.

## Review policy and release identity

Keep user-approved macOS-first scope, native picker, recommended permission preset, model/source selector, adaptive one-question loop, early file upload, reusable assets, synchronized views and manual/AI edits, bounded optimization, public research and runnable narrow Isaac export. The 50-robot local benchmark and the two-robot target adapter fixture prove different claims; neither substitutes for the other.

Do not select a public release version merely to make tooling green. After G2 and package API review, propose one coordinated product/package release target with an independent spatial format. Only promote capabilities from experimental when their acceptance passes. Existing CLI users do not auto-activate AI or spatial migrations after an update.

Desktop updates replace the signed complete application atomically on restart. They never let the CLI's runtime updater hot-swap code inside the desktop bundle. Standalone npx retains its verified update route. Stage desktop releases, verify provenance/signing, then promote their own channel under the coordinated release train.

The prior stable npm release needed explicit verification-only recovery after eventual-consistency readback. R4 adds idempotent post-publication verification and bounded registry-read retries BEFORE publishing this iteration. A retry never republishes an existing version blindly or weakens source/integrity checks.

## Scope-to-task coverage

| Product requirement | Tasks |
|---|---|
| macOS/native folders/permissions/updates | D1-D4, R3-R4 |
| OpenRouter/Codex/Grok selection and auth | D0, A1-A2 |
| Text/file intake and adaptive discovery | D3, A3-A4 |
| Public research/usage limits | A1, A4-A5 |
| Portable conversations/undo/conflicts | D2, A3, S1, S3 |
| Approved split UI/3D/top-down/direct editing | S2-S3, R3 |
| Reusable assets/versioning/import | D3, S1-S2 |
| 50 mixed robots/objective comparisons | S4-S6 |
| Narrow runnable Isaac handoff | R1-R2 |
| Old-reader behavior/spec and release semantics | S1, R4 |
| Native/accessibility/security QA | D0, D4, A2, R2-R4 |

Additional mandatory coverage: source-to-simulation RequirementBinding in S1; asset assembly/behavior/template/draft promotion in S2a; early feasibility in S2b; fixed baseline/field-source UX in S3/S6; no-account example in D3; account disconnect/API/contribution/version matrices in interfaces.md; second-engineer continuation and comparative evidence in R5.

## NOT in scope

Windows desktop, remote GPU management, multi-floor elevators, arms/humanoids/drones, arbitrary vendor selection, detailed local sensor/contact physics, real robot/facility writes, hosted collaboration, telemetry collection and operator/safety certification. Retain post-v1 test-execution/result-assessment roadmap. Remote test hardware access is a verification dependency, not a new hosted product feature.

## GSTACK REVIEW REPORT

CEO: reviewed,6Devin findings incorporated. Design: reviewed,5Devin findings resolved/refined without changing the approved layout. DX: reviewed,4Devin findings incorporated. Engineering: reviewed,6Devin findings triaged into4clarifications/corrections and2already-assigned obligations; focused repair verification found one task-file omission, corrected by the primary reviewer. No residual contradiction is knowingly left in the reviewed repairs. Claude and the installed Codex CLI were unavailable; Devin was used with explicit user authorization. These are planning reviews, not executed feature acceptance or independent security certification.

Verdict: Hansel approved staged end-to-end implementation on2026-09-07, with G1-G5 enforced. Not cleared for publication or claims of completed provider/Isaac/desktop acceptance. Approved engineering choices: Electron/shared Node host; constrained public-topic research with reviewed custom queries; two-Jetbot Isaac reference distinct from the50-robot local workload; proposed exploration/scene/performance bounds. Existing user-approved product scope remains intact. Prefer subagent-driven bounded implementation with one owner per shared contract and at most coordinator+two agents.
