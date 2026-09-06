# Handoff, QA and release tasks

Dependencies: R1 follows S1/S2; R2 follows R1/S5 and a real target environment; R3 follows desktop/discovery/editor/simulation integration; R4 follows all applicable acceptance gates. External account or machine setup is not assumed authorized simply because this plan exists.

## R1. Deterministic Isaac export package

Files: create `packages/isaac-export/src/{profile,plan,usd,manifest,loss-report}.ts`, `templates/isaac-6.0.0/run.py`, `templates/isaac-6.0.0/README.md`; modify `packages/project-fs/src/export/{contracts,plan,service}.ts`; tests `tests/isaac/export.test.ts`, `tests/security/spatial-export.test.ts`.

- [ ] Write goldens for scene geometry, explicit units/axes, poses, stable IDs, workload and unsupported-field report. Test wrong hashes, unknown target/robot, missing asset pack, case collisions, traversal, malicious USD references and deterministic repeated export.
- [ ] Target Isaac Sim 6.0.0 exact build on Ubuntu24.04x86_64 with a separately installed licensed asset pack. Pin target asset paths and checksums in the acceptance manifest. Do not bundle NVIDIA assets merely because Isaac source is Apache2.
- [ ] Export `scene.usda`, `scenario.json`, `asset-requirements.json`, static `run.py`, `README.md`, `unsupported.json`, `manifest.json`. Scene geometric objects are generated from the canonical compiler; no model-authored arbitrary Python is part of the normal export.
- [ ] Define the narrow reference as two NVIDIA Jetbots, two stations and one shared intersection. The robot adapter uses measured pose feedback and differential wheel commands for exported goals. The exporter clearly limits supported load, drive and task types. A Jetbot fixture is an interoperability test, not validation of a full warehouse AMR fleet.
- [ ] Extend confined export member types for immutable assets/run results; all files have size/hash/source identity. Error before creating a misleading runnable bundle if mandatory mapping is missing. Broader importable-only exports state remaining setup and have no runnable-reference badge.
- [ ] Run `npx --no-install vitest run tests/isaac/export.test.ts tests/security/spatial-export.test.ts`; compare goldens and archive inventory. Commit export generation separately from runtime acceptance.

## R2. Execute the target reference and preserve proof

Files: create `scripts/verify-isaac-reference.py`, `tests/isaac/reference-contract.test.ts`, `docs/verification/isaac-reference.md`; add an explicit protected GPU verification job in `.github/workflows/isaac.yml` only after a real runner is configured.

- [ ] Identify compatible hardware and authorized access; record OS, GPU/driver, Isaac build, target assets and runtime settings. The current M4 Mac is not an Isaac RTX acceptance host. Do not provision paid cloud resources without the required user choice and budget.
- [ ] Verify exact source/package/asset hashes before execution. Import the exported package on that target; assert units, transforms and collision geometry match the manifest.
- [ ] Run both robot controllers to the exported goals with measured pose feedback. Prohibit direct pose-setting/teleportation after initialization. Initial reference thresholds: final position error<=0.10m, heading error<=0.15rad; all reference tasks accounted for; no prohibited collision/contact in monitored fixtures; no unreported overlap of the reserved intersection.
- [ ] Execute failure fixtures: block a destination, remove a required asset, supply unsupported drive type, wrong target build and change the source identity. Expect explicit failure/unsupported result, never a prerecorded successful animation.
- [ ] Persist target observations, contact/trajectory checks, task outcomes, runtime/version/hardware identity and original source hashes. Compare with local planning results as two modeling layers, not guaranteed identical physics.
- [ ] Run `python scripts/verify-isaac-reference.py --package <verified-export-directory> --report <result-directory>` only on the declared target. Paths are execution inputs selected in the run record; they are not nonexistent hardcoded machine paths. Exit0 only when every runtime condition passes. G4 remains blocked until actual proof exists.
- [ ] Commit static verifier, target contract tests and sanitized proof metadata. Do not include private machine credentials or license material.

## R3. Whole-experience design, accessibility and security QA

Files: create `tests/browser/{desktop-journey,desktop-recovery,desktop-accessibility}.spec.ts`, `tests/security/desktop-agent-boundary.test.ts`, `docs/verification/agentic-desktop-acceptance.md`; update `DESIGN.md`, `TESTING.md`, CLI/agent compatibility docs to match actual delivered behavior.

- [ ] Use design-review and QA skills against the chosen mockup plus actual interaction states: empty, loading, success, partial, failure, cancellation, conflict and resume. Do not claim a static screenshot proves behavior.
- [ ] Test native folder chooser/file upload, remembered permission preset, model/source selector, adaptive questions, context chips,3D/top-down editing, asset composition, objective comparison and export through the packaged app.
- [ ] Test interrupted OAuth, duplicate callback, lost mutation response, provider disconnect, renderer crash, worker crash, app quit during checkpoint and late AI answer after a manual edit. Verify durable recovery and no cross-project leak.
- [ ] Test real macOS keyboard navigation and VoiceOver for changed complete flows; numeric alternatives for every drag action; visible focus/labels/contrast; reduced motion. V1's explicit screen-reader deferral is not inherited automatically.
- [ ] Security negative tests use fake data to exercise renderer IPC spoofing, native URL opening, filesystem escape, provider tool escape, native search bypass, asset resolver external access and forged operator decisions. Failure blocks the dependent integration.
- [ ] Run complete automated suites once after integrated changes pass focused checks. Use one whole-branch review and at most two global repair cycles; do not duplicate release-owned reviews. New unrelated findings become follow-up work unless they block correctness or release.
- [ ] Record actual outcomes, screenshots, model/provider versions, hardware, timing, unsupported coverage and reproduction commands. No invented customer-discovery evidence.

## R4. Release identity, installer, updates and exact final verification

Files: create `scripts/build-desktop.mjs`, `verify-desktop.mjs`, `verify-desktop-update.mjs`, `.github/workflows/desktop.yml`; modify `.github/workflows/release.yml`, `published.yml`, `scripts/verify-release.mjs`, `docs/releasing.md`, `VERSION`, Changeset intent and package metadata only after the compatibility decision.

- [ ] Read G2 results and choose a coordinated semantic release target. Record whether the public project format remains spec1.0.0+required capability or needs a backed-up migration. Do not bump blindly or make legacy readers silently accept unsupported semantics.
- [ ] Package macOS arm64 and x64 only when each selected target is supported by current dependencies and native CI. Default plan is separate architecture downloads; if Intel validation cannot pass, surface a platform-scope decision instead of silently labeling universal support.
- [ ] Configure macOS signing/notarization through authorized Developer ID credentials. Verify nested executables and downloaded update signatures, hardened runtime, entitlements, Gatekeeper first launch and native Keychain behavior. Preserve provider-owned binary identity; do not arbitrarily mutate bundled third-party runtimes.
- [ ] Desktop update test starts from the previous signed candidate, downloads the new complete signed app, restarts and retains project/conversation/revision state. Invalid signature/provenance/channel or interrupted download keeps the current app. A desktop session must never invoke the CLI updater to replace its bundled service code.
- [ ] Add explicit `verify-existing` recovery to publication workflow before first new release: on exact existing version, verify source/provenance/integrity and installation, never republish or treat an arbitrary version collision as success. Registry-read retries are bounded and only for post-publication visibility/transient network errors; bad signatures or identity mismatches never retry into acceptance.
- [ ] Run strict `/ship`, then `/land-and-deploy`, preserving source, coverage, design, review, version, CI and installed-health checks. Release gates must reject missing/cancelled/failed required jobs. No raw tag write bypass of the promotion guard.
- [ ] Publish candidate, verify actual npm/native/desktop artifacts, publish stable to a non-default channel, verify it and then promote through guarded proofs. Update receipts record the same source commit. No assumptions from a green local build or cached origin/main.
- [ ] Finish with canonical local main and live GitHub main at the exact release commit and report any preserved unrelated state. Confirm actual default installation, signed desktop first launch and no model/asset network access before the corresponding user grant.

## Required artifacts and commands

| Gate | Artifact | Success condition |
|---|---|---|
| Contract | `test-results/spatial-compatibility.json` | Published v1 cannot misleadingly mutate/approve/export unsupported spatial intent |
| Providers | `test-results/provider-contracts/*.json` | Exact accepted protocols, isolated authority and authenticated bounded execution |
| Agent quality | `test-results/discovery-evals.json` | No fabricated confirmed facts, stale questions/actions or protected writes; rubric and observed failures retained |
| Fleet | `test-results/fleet-benchmark.json` | Named target thresholds and independent geometric/task checks pass |
| Isaac | `test-results/isaac-reference/manifest.json` | Actual supported target execution and failure fixtures pass |
| UI | `docs/verification/agentic-desktop-acceptance.md` | End-to-end native/keyboard/accessibility/design evidence, honest unavailable coverage |
| Release | `test-results/desktop-release.json` | Signature/notarization, installed health, update, source and channel equality |

Representative agent-quality evaluation set: 12 synthetic cases covering initial undecided need, known deployment, contradictory floor-plan scale, forklift-shared aisle, unknown baseline, overloaded station, partial source, false citation, unsupported robot, invalid objective, prompt-injected attachment and late user correction. Score the next question's relevance, avoided repetition, source traceability and correct uncertainty. Functional invariants are binary gates. Report human rubric review separately from model judging.

Use a blinded0-4rubric for relevance, adaptation, traceability and uncertainty, with three repeats per supported model/adapter configuration. Required mean>=3.2/4 and every critical contradiction/injection/correction case>=3/4; zero fabricated confirmed facts, protected writes or repeated resolved subjects. Four counterfactual pairs change one material fact and require the next question/action to change appropriately. Compare with a fixed questionnaire baseline on the same packet; adaptive behavior must improve at least three of four counterfactual pairs without violating any binary invariant. Save rater instructions, raw scores and disagreements. These are proposed release-quality thresholds, not observed success rates. Live evaluation has a separately approved finite request/token budget and cannot run indefinitely to select a favorable sample.

## R5. Product continuity and competitive benchmark

Files: create `fixtures/handoff-benchmark/packet.json`, `scripts/score-handoff.mjs`, `docs/verification/handoff-benchmark.md`; test `tests/agent/handoff-continuity.test.ts`.

- [ ] Freeze a fictional floor plan, incomplete notes, conflicting measurement, later correction, workload and objective change. Enumerate required discovered gaps and expected source-to-simulation bindings before either workflow is evaluated.
- [ ] Run a document/spreadsheet plus ordinary simulator setup baseline, then RoboPomelo on the same packet. Record time, help required, corrections, missing assumptions, transfer failures and second-engineer reconstruction effort.
- [ ] Give a second reviewer the exported package without the original conversation. Require that they can trace every mandatory simulator input to its source/assumption and complete the supported target run. Correct one source fact and prove the right derived fields/results change while unrelated ones do not.
- [ ] Compare Isaac workflow and any available VisualComponents/InOrbit workflow only with authorized access. Record unavailable tools as unmeasured; do not invent comparative scores or purchase access. Unavailable commercial comparisons block superiority claims, not independent technical release.
- [ ] Mandatory continuity gate:100%mandatory field bindings inspectable, no silently omitted mandatory input, and supported reference run reproducible by the second reviewer. Timing is reported against observed baseline; a claim of reduced handoff effort requires measured improvement. A failed continuity gate triggers workflow correction before full delivery.
- [ ] Run `node scripts/score-handoff.mjs --packet fixtures/handoff-benchmark/packet.json --observations test-results/handoff-observations.json`; output exact omissions/unknowns and pass/fail. Commit benchmark protocol and sanitized observed results, separating synthetic evaluation from real customer evidence.

Model-independent fixture tests run offline. Live provider/Isaac/signing tests are explicit named integration gates with finite limits. They cannot be replaced by mocks; their absence blocks claims of full end-to-end delivery.
