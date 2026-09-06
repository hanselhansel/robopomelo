# Public interfaces, connection lifecycle and compatibility

Normative supplement to the [root plan](../2026-09-07-agentic-desktop.md). Add this inventory to generated CLI help, desktop bridge schemas and docs before dependent features ship. No new runtime endpoint is implemented by this document.

## Connection lifecycle

Desktop Settings offers Connect, Reconnect, Disconnect and Forget project permissions as distinct actions. Disconnect synchronously increments connection generation, rejects new/late requests, cancels active runs, closes provider processes and deletes the encrypted credential/blob or invokes the provider-owned supported logout operation. Reconnect cannot reuse an old attempt/state. Connecting a different account creates a new connection identity; project model selection is retained as unavailable until explicitly assigned to that identity.

Preserve source, transcripts, run results and unsent drafts on disconnect. Do not claim provider-side token revocation if only local deletion occurred; expose a provider account-management link where remote revocation is supported. If local credential deletion fails, mark connection `disabled-cleanup-required`, deny every request through it and show a retry-cleanup action. A failed cleanup never silently re-enables a connection. Test disconnect during generation, callback after disconnect, wrong-account reconnect, encrypted-store failure and app restart while cleanup is pending.

Add `disconnect(connectionId)` and `connectionStatus(connectionId)` to the typed desktop broker; callers get state/account label/model metadata only, never secret material. Account operations are desktop-native in this iteration. Standalone CLI/Skills retain deterministic planning actions without requiring account credentials or a running desktop app.

## CLI and shared-service inventory

Every finite command supports existing `--project PATH`, `--json` and `--offline` semantics where applicable. Ordinary writes require existing explicit author/evidence/export authority; `--yes` cannot create operator authority. JSON preserves the existing formatVersion/command/ok/data/findings/errors/sourceRevision/sourceHash/toolVersion/specVersion envelope.

| Command | Arguments | Behavior and output |
|---|---|---|
| `capabilities list` | `--project PATH` optional | Supported IDs/ranges and missing project requirements |
| `scene show` | `--scene ID` | Canonical objects/bindings/assumption status, not renderer internals |
| `scene apply` | `--patch FILE --mutation-id ID --base-revision ID --base-hash HASH` | Checked SpatialEnvelope; committed/proposed/conflict receipt |
| `assets list` | `--query TEXT` optional | Bounded catalog metadata/versions; no whole mesh in JSON |
| `assets validate` | `--manifest FILE` | Offline schema/geometry/license-metadata/compatibility findings |
| `assets import` | `--file FILE --mutation-id ID --base-revision ID --base-hash HASH` | Confined immutable import with source receipt |
| `assets promote` | `--draft ID --mutation-id ID --base-revision ID --base-hash HASH` | Validate and create new immutable reusable version |
| `simulation run` | `--scenario ID --seed N --wall-ms N` | Finite local run; JSON final manifest/status and exact limits |
| `simulation inspect` | `--run ID` | Immutable manifest, metrics and termination state |
| `simulation compare` | `--baseline ID --alternative ID` repeatable | Workload/input compatibility and objective trade-offs |
| `export` | Existing formats plus `--format isaac --scenario ID --run ID` optional | Versioned package plan, unsupported report and exact source identity |

No unrestricted arbitrary-code command, generic remote robot control or secret-returning connection command is added. SIGINT cancels finite local runs and persists partial status; it never labels incomplete runs completed. Desktop has a broker `cancelRun` for interactive work; cross-process remote cancellation is not implied by a runId string.

JSON exit codes preserve `apps/cli/src/output.ts` and `docs/cli.md`:0success,1unexpected failure,2invalid structured input,3blocked/failed planning gate,4source conflict,5authority denial,6filesystem/archive/recovery failure,7unsupported version/capability/runtime,8explicit network/verification/install failure. Add explicit mappings for new typed errors in output.ts. A budget-exhausted planning run returns3with its partial manifest; a user-cancelled run returns130with its partial manifest. Partial command results use the existing generic envelope with ok:false and typed data, not errorEnvelope's data:null path. R3 tests exact codes/envelopes and existing-v1 parity.

Shared service routes, available only through the existing authenticated local session:

| Route | Request | Boundary |
|---|---|---|
| `GET /api/capabilities` | None | Inspect; public capability metadata |
| `GET /api/scenes/:id` | None | Project epoch + inspect |
| `POST /api/scenes/actions` | SpatialEnvelope | Project epoch + CSRF + author + current source |
| `GET /api/assets` | Bounded query | Inspect; scoped catalog |
| `POST /api/assets/import` | Valid staged selection + source base | Explicit import + author/evidence-equivalent dedicated capability |
| `POST /api/agent/runs` | Typed run/model/selection IDs | Project + destination grant + budget; no raw key |
| `POST /api/agent/runs/:id/cancel` | Run generation | Same owning project/session; invalidates before abort |
| `POST /api/simulation/runs` | Scenario/base/seed/limits | Local simulation grant; immutable input snapshot |
| `GET /api/simulation/runs/:id` | None | Project inspect; hash-checked manifest |
| `POST /api/simulation/compare` | Exact baseline/alternative run IDs | Inspect; same workload or explicit incompatibility |

Native folder selection and account lifecycle stay on the validated desktop broker. Any HTTP bridge to those capabilities must verify a main-issued selection/attempt token and cannot grant authority from an arbitrary request path. No second session-credential scheme is invented for these routes.

## Contribution contracts

Asset contribution layout: `assets/contributed/<slug>/manifest.json`, `README.md`, `LICENSE`, `fixtures/valid.json`, `fixtures/invalid.json`, and referenced content-addressed source data. Manifest fields: id, version, spatialFormatRange, kind(object/assembly/behavior/template), parameterSchema, componentRefs, geometryRecipe, behaviorProfile, source, license, sha256 and exportProfiles. Runtime scripts/URLs are rejected. Registration is an explicit reviewed catalog entry; placing a file in a project does not auto-trust it.

Adapter contribution layout: `packages/providers/src/<slug>/manifest.json`, `adapter.ts`, `fixtures/`, plus `tests/providers/<slug>.test.ts`. Manifest fields: id, version, adapterApiVersion, supportedRuntimeRange, modelInventory, inputKinds, structuredActions, cancellation, nativeToolsDisabled, researchMediation and credentialOwner. Metadata cannot assert a live gate passed; maintainer-signed acceptance reports provide that separately. Export adapters use the same declared capability/fixture convention in `packages/isaac-export` or a future dedicated target package.

Add `scripts/check-contribution.mjs --manifest FILE` with `tests/tooling/contribution-manifest.test.mjs`; offline command verifies schemas, file hashes, relative paths, ranges, source/license metadata and expected invalid fixtures. It does not download/execute contributor code. Actual adapter acceptance is a separate reviewed test invocation. R3 adds complete example contribution and command output to CONTRIBUTING.md.

## Compatibility matrix and migration ownership

| Reader/writer | Older project | Current spatial project | Newer unknown formats |
|---|---|---|---|
| Released CLI1.0.0 | Preserve current behavior | G2 must show blocked writes/approval and explicit unsupported scope | No assumed compatibility |
| New desktop | Read without AI grant; explicit spatial activation | Full supported editing, pinned asset/runtime ranges | Inspection only with visible unsupported members |
| New CLI | Existing commands unchanged | Deterministic scene/run/export within declared capability | No writes/approval; typed unsupported error |
| External Skill | Declared supported spec/capability range | Same typed actions; no provider-specific business logic | Stop and report required range |
| Future desktop/CLI fixture | Migration tested against preserved old bytes | Format migrations explicit with backups | Unknown conversation/run/asset/profile versions remain preserved and unavailable |

Each project format, spatial extension, conversation/event format, run manifest, asset and target profile has a declared version/range. The application service owns migrations through existing project-fs backup/recovery transactions; renderers/Skills/providers cannot migrate by rewriting JSON independently. Two writers cannot migrate concurrently; source lock/base identity protects ownership. Binary downgrade never reverse-migrates source automatically.

Add `tests/distribution/version-matrix.test.ts`: previous/current CLI and current desktop against old/current/future synthetic envelopes, including unknown conversation/run members, stale asset versions and target profiles. Preserve unsupported bytes, report blocking versions via capabilities list, and forbid semantic writes/approval/export claims until compatibility is established. Future fixtures test refusal/preservation, not fabricated support for an unimplemented version.

## Assigned implementation

A2/D4 implement connection lifecycle and its tests. D2/S1/S6/R1 add the exact CLI/service inventory; create `tests/distribution/spatial-cli.test.ts` and `tests/runtime/spatial-routes.test.ts` covering success, authority, idempotency, conflict, cancellation and unsupported versions. S2a/R3 implement contribution contracts and tutorials. S1/R4 own the version matrix and migration gates. All help/documentation examples are generated/checked against those interfaces.
