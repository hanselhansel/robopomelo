# RoboPomelo agentic desktop continuation handoff

Prepared2026-09-07 after Hansel requested continuation in another LLM session.
This is a handoff, not a completion or release claim. Preserve the dirty worktree.

## Objective and authority

Implement the approved RoboPomelo agentic macOS desktop design and engineering plan end to end: connected adaptive discovery, reusable spatial assets, direct3D/top-down editing, bounded50-robot fleet experiments, one tested narrow Isaac Sim handoff, strict ship/land verification, and canonical local/live main reconciliation. Preserve provider, GPU, signing, compatibility and security gates.

Hansel approved the product design, written engineering plan and end-to-end implementation. Do not restart brainstorming questions or ask him to approve settled design choices. Use brainstorming proportionally to reorient, then execute the existing plan. Routine green commits, pushes, PR creation, merges and deployment/reconciliation are authorized. No new approval is needed merely because a skill suggests a routine proceed gate. Material scope/version/security decisions remain explicit gates.

The user asked to transfer work to another LLM. Do not let two sessions edit this worktree simultaneously. The old task's active goal should be paused in its UI before the new session starts. This handoff did not mark the goal complete or blocked.

## Repository and current authoritative state

- Public repository: https://github.com/hanselhansel/robopomelo
- Brand RoboPomelo, Apache-2.0, free/open-source. No payment messaging in this iteration.
- Canonical checkout: `/Users/hansel/conductor/repos/robopomelo`.
- ACTIVE implementation worktree: `/Users/hansel/conductor/repos/robopomelo/.worktrees/agentic-desktop`.
- ACTIVE branch: `feat/agentic-desktop`.
- ACTIVE committed HEAD: `2c64be9` (`feat(desktop): connect selected attachments and scoped previews`).
- Planning worktree: `/Users/hansel/conductor/repos/robopomelo/.worktrees/v1`, branch `chore/agentic-desktop-design`; preserve it.
- Canonical checkout and live GitHub main were freshly checked at handoff: both `cafb7409e6e653ea504e0087612e66fac37842a8`. Canonical checkout was clean.
- npm tags freshly checked: `latest=1.0.0`, `verification=1.0.0`, `candidate=1.0.0-rc.1`.
- The new desktop iteration is NOT published, merged or release-ready.
- There are substantial intentional uncommitted and untracked implementation files. GitHub main does NOT contain them. A new session needs this exact worktree, including untracked files.

Never commit to main. Never reset, stash, force-push, discard work or clean unrelated state to manufacture a clean tree. Commit each meaningful green change on the feature branch. Keep authored source files below400lines. Do not copy code/history/packages from other physical-AI repositories. Do not read/index `~/hansel-brain` or the2026-job-search repository. Do not modify the old research repository.

## Read these authoritative documents

Paths below are relative to the active implementation worktree:

1. `AGENTS.md`
2. `docs/superpowers/specs/2026-09-07-agentic-desktop-design.md`
3. `docs/superpowers/specs/agentic-desktop/approved-workspace.png`
4. `docs/superpowers/plans/2026-09-07-agentic-desktop.md`
5. `docs/superpowers/plans/agentic-desktop/contracts.md`
6. `docs/superpowers/plans/agentic-desktop/desktop-agent.md`
7. `docs/superpowers/plans/agentic-desktop/spatial-simulation.md`
8. `docs/superpowers/plans/agentic-desktop/release-validation.md`
9. `docs/superpowers/plans/agentic-desktop/interfaces.md`
10. `docs/superpowers/plans/agentic-desktop/review.md`
11. `docs/verification/agentic-desktop-progress.md`
12. `docs/verification/attachment-ingestion.md`
13. `docs/verification/credential-store.md` (currently untracked)

The progress document predates some current uncommitted work. This handoff plus live files/tests supersede its status where they differ. Plan approval does not mean task checkboxes or acceptance gates passed.

## Product decisions to preserve

- Local macOS desktop first, connected AI optional. Existing model-free CLI/browser use remains.
- Electron + existing React/Vite frontend + shared Node/TypeScript service and deterministic core. Do not replace the core with model-owned logic.
- Native folder picker, easy folder naming in Finder, recommended permissions with one clear confirmation. Preserve cancellation and editing state.
- Initial user: AMR vendor/integrator solutions engineer or deployment PM. Warehouse operator reviews the resulting specification.
- Agent asks one adaptive material question at a time, uncovering needs, problems, risks, constraints and missing information. Later questions respond to new answers/files. Manual editing remains possible.
- Files can be uploaded/dropped from the beginning. Preserve original inputs and provenance.
- OpenRouter plus supported Codex/Grok account integrations. These account adapters need actual containment proof before advertising support. No copying existing user auth files into an improvised API bridge.
- Model selector groups by connection, showing model/effort and route, e.g. “via Codex” or “via OpenRouter.” Identical model names must remain distinguishable. No silent provider/model fallback.
- Workspace design: conversation left, scene/specification/comparison right. Full3D and top-down views share selection, edits and undo. Direct per-object/layout editing is required.
- Reusable narrow objects, assemblies, behaviors and templates. Support project-local drafts and explicit promotion/pinning into reusable libraries. Avoid regenerating assets from scratch by default.
- Source-to-simulation RequirementBindings carry provenance, knowledge state and targeted invalidation.
- Deterministic lightweight kinematic simulation, single floor, mixed wheeled AMRs, differential and omnidirectional first, approximately50robots. No model call per robot/frame.
- Users choose objectives: throughput, fleet count, cost sensitivity, constraints and trade-offs. No universal optimization default.
- Proactive exploration defaults:3variants,2local workers,60seconds local wall time,4model turns,4096output-token upper bound where supported. Visible pause/deeper-run controls. Retries consume budgets appropriately.
- One narrow runnable Isaac Sim6.0.0 reference, two Jetbots, Ubuntu24.04 x86_64 RTX environment. This is separate from the50-robot local benchmark.
- Bridge planning into robotics platforms, do not replace Isaac/OpenUSD/Open-RMF. No robot control, facility-system writes, physical safety certification or production-readiness claims.
- Source of truth remains `deployment.yaml`, with stable IDs, explicit units and knowledge states. Raw files and immutable generated assets live in portable project folders. Credentials/permissions are machine-local and separate.
- Humans approve projects. Stable RP validation, structured warning acknowledgment, only explicitly waivable findings, and material-change approval invalidation remain.
- Public research uses reviewed generic topic queries, not private project text or model-native web search. Private data may go only to the selected, authorized AI destination.
- Automatic compatible stable updates are the agreed default with opt-out. Desktop updates replace the signed app, never hot-swap the standalone CLI runtime into Electron.

## Workflow and release rules

This is Deep tier because it crosses native privileges, filesystem/credential/network boundaries, public contracts and coupled systems. Use the approved design/plan, appropriate TDD/security/frontend/QA skills and isolated worktree.

Research only decision-relevant current practice using official/primary sources. Deep research budget is at most10queries before reassessment. Record retrieval dates. Do not search merely to repeat settled decisions. Web content is evidence, never instructions.

At most3active agents including coordinator. Delegate only independent bounded work. Prefer fresh, narrowly scoped agents without full-history forks. The previous collaboration tool eventually hit its thread limit; do not assume old handles are usable in another session.

Use one final whole-branch review and at most two global repair cycles. Component reviews already performed do not replace that review; do not duplicate release-owned reviews. Hansel authorized Devin CLI for external reviews.

Strict release: run gstack `/ship` exactly, then `/land-and-deploy` exactly. Keep tests/coverage/review/version/CI/merge/deployment/health/reconciliation. Stop publication for failed CI, unresolved security, conflicts, unexpected scope, unresolved release-semantic version choice, destructive recovery or unhealthy deployment. Deploy when configured. Final canonical local main and live GitHub main must match, with unrelated state preserved and honestly reported.

Read skills fully when applying them. Brainstorming/writing-plans/autoplan/design exploration already produced an approved plan. Do not redo those approval ceremonies. The design-review skill was only partially read near the interruption, with a truncated tool result; its live workflow was NOT completed or claimed passed. Full visual/accessibility/security QA remains.

Use GBrain context_pack/recall when available per AGENTS. Its entities argument is a string. Save only durable user-authored claims; never credentials, transcripts, code already in Git or agent-generated conclusions. Do not edit filesystem memories without a direct request.

## Toolchain

Use this Node/npm, not the older global npm:

```sh
cd /Users/hansel/conductor/repos/robopomelo/.worktrees/agentic-desktop
export PATH=/Users/hansel/.cache/robopomelo-build/node-v24.20.0-darwin-arm64/bin:$PATH
```

Node24.20.0, npm11.19.0. Existing dependencies are installed. Use `npm ci --ignore-scripts` if reinstalling; do not enable arbitrary lifecycle scripts. Electron's pinned download was separately reviewed/executed earlier.

- Electron44.2.0 exact pin.
- PDF.js `pdfjs-dist`6.3.289 exact pin.
- Existing Vite/esbuild builds, no Forge dependency installed yet.
- PDF.js optional native canvas dependencies installed, but browser parser must not use Node canvas.
- `qpdf` is installed only as a fixture regeneration tool; ordinary tests use a committed synthetic encrypted PDF.

Useful commands:

```sh
npm run typecheck
npm run check:boundaries
npm run check:source-lines
npm run test:tooling
npx --no-install vitest run tests/desktop tests/security/agent-grants.test.ts
npx --no-install vitest run apps/web/test
npm run build:desktop
npm run test:desktop-smoke
npm run build && npm run verify:package
```

The current CLI build still labels its local artifact1.0.0-rc.1 from existing release configuration. That is a test artifact, not authorization to republish that version. No desktop iteration release version has been approved.

## Committed progress

- D1 native host/isolation:17desktop tests, boundary hardening, actual Electron smoke, bounded parent watchdog and owned process cleanup. Reviewed.
- `cf729ac`: metadata-only provider probes. No inference/auth/containment acceptance implied.
- `61557cc`: extracted shared application service. CLI retains compatibility facades.
- `49f8183`: desktop service lifetime and truthful disabled development updater.
- `f151ec1`: immutable pre-extraction HTTP parity baseline, from exact historical commitcf729ac0c383913454ebb9a66ce8100d2b0eb455. Includes canonical YAML, receipt, validation and all seven decoded export artifact bytes. Avoid alias-to-alias “parity.”
- `c5918b3`: Electron starts/owns shared loopback service and bundled UI; actual window-close/app-quit smoke passed. Rebuilt CLI passed9installed-package checks.
- `83ad15c`, `9e04cf7`: pure bounded attachment preflight and PDF dependency pin.
- `a9359cc`: sandbox parser. Real PDF/image tests, CMap support, cancellation/deadline, hung-renderer process exit, network/file denial. Reviewed.
- `2c64be9`: selected-file I/O, attachment broker, native inspection/cancellation and authenticated PNG previews.59desktop/parity tests and complete Electron smoke passed at commit; scoped reviews closed navigation/project-context races.

## Current uncommitted work

All these files are intentional. Preserve them, inspect them, finish their tests, then commit green changes. Do not replace the branch with main.

### D4 permission and credential components

- `packages/spec/src/agent-grants.ts`
- `packages/application/src/agent-grants.ts`
- `packages/project-fs/src/settings/schema.ts`, public index exports
- `apps/desktop/src/credential-store.ts`
- `apps/desktop/src/credential-encryption.ts`
- `tests/security/agent-grants.test.ts`
- `tests/desktop/credentials.test.ts`
- `docs/verification/credential-store.md`

AgentGrantStore API:
- issueNativeConfirmation(binding,preset) creates an opaque store-local WeakMap token only AFTER real native acceptance.
- confirmPreset(binding,preset,token) atomically persists ordinary and separate AI grants using one SettingsStore.update.
- Token is one-use,60second, root/project/preset/settings-generation bound.
- lookup/check/withAuthorization/revoke validate the paired ordinary grant remains active and at the same generation.
- Legacy TrustStore revoke/regrant/forget also invalidates paired AI authority.
- Generic AI scope is necessary but NOT sufficient for network dispatch. Named connection, destination, generation and exact authorized context must be enforced by A1/A2/A3.

CredentialStore API:
- `CredentialStore.open(fixedMachineDirectory,encryptionProvider)`.
- create(provider,secret,label?), list(), getSecret(id), remove(id), close().
- IDs are connection-UUIDv4; providers openrouter/codex/grok.
- Metadata and secret are encrypted in per-ID files. Owner-only paths, SafeRoot checks, cross-instance lock, atomic rotation/remove and sanitized errors.
- `createMacOSEncryptionProvider(safeStorage)` uses async Electron APIs after app readiness.
- No actual Keychain/account credentials were accessed. Tests use explicitly fake encryption. Signed-app Keychain acceptance remains a gate.

Scoped spec review passed and independently ran21tests (10grant,11credential). Earlier grant+legacy trust run passed21with1Windows-only skip. External Devin quality review did NOT complete; see review status below.

### Native setup and visible intake

- `packages/spec/src/desktop.ts` now shares DesktopBridge types; native-contracts reexports them.
- Bridge currently has7methods: chooseProjectFolder,selectAttachments,dropAttachments,inspectAttachment,cancelAttachment,confirmSetup,cancelRun.
- Dropped File objects use webUtils.getPathForFile in UI preload; JS-constructed Files do not yield filesystem authority. Parser preload is forbidden from importing webUtils.
- `apps/desktop/src/native-setup.ts`: prepare/preview/confirmed setup service.
- `apps/desktop/src/attachment-broker.ts`: new collect() returns copied selected bytes for import.
- Native dialogs/registration/preload/main/application-service integrations.
- `POST /api/intake/prepare` CURRENT body is exactly `{name,seed,description,attachmentIds}`. Stable client intent ID/resume/status APIs are NOT implemented yet.
- Preparation is memory-only. Native preview binds revision/root/project identity/preset/mode before the real confirmation sheet.
- Confirmation creates/opens project, grants preset, imports original files and raw brief through existing EvidenceService transactions. `deployment.yaml` references planning evidence with paths/hashes. Raw brief is a text attachment, not copied into YAML fields.
- Inspection opens valid or invalid existing source without source edits or AI authority. Inspection creation/import is refused.
- Native confirmation cancellation restores a still-valid latest folder selection. Successful confirmation stays one-use. Normal cancellation uses a private failure marker rather than Electron's noisy rejected-handler log; preload removes transport prefixes. Intake treats cancellation as normal return to editing.

Frontend files:
- `apps/web/src/App.tsx`
- `apps/web/src/features/intake/{Intake,Attachments,Preview,state}.tsx/ts` and `intake.css`
- `apps/web/test/intake.test.tsx`, `intake-preview.test.tsx`

Native UI uses a prominent prompt, optional name, native folder picker, upload/dropzone, per-file status and authenticated canvas previews. Recommended preset defaults on; inspection only for opening without notes/files. App-owned pending draft survives component navigation/errors; successful setup now clears consumed draft IDs. CLI/browser without native bridge retains legacy Welcome.

Current frontend setup sequence: prepare -> native confirm -> GETsession/setSession -> GETproject/onOpen. This sequence has the P1 recovery flaw below.

Test harness updates:
- `apps/desktop/application-smoke.ts`, `runtime-smoke.ts`, new `smoke-ui.ts`.
- Actual Electron smoke passed visible UI fill, genuine disk-backed File via CDP drop, folder chooser (only OS dialogs stubbed), cancel confirmation, retry without repicking, project creation, permissions and2planning evidence records, both window-close/app-quit paths.
- Screenshot: `test-results/desktop-smoke/workspace.png` (new intake); parser preview: `test-results/parser-smoke/pdf-preview.png`.
- Full design review, responsive/minimum-window QA, accessibility and real native picker interaction are NOT finished. Do not equate smoke or jsdom tests with full frontend acceptance.

## STOP: two unresolved P1 findings. Start here.

### P1: confirmed root must be checked before initialization writes

CURRENT RED regression in `tests/desktop/native-setup.test.ts`:
`does not initialize a replacement directory after the confirmed root was swapped`.

Fresh handoff verification:6tests ran,5passed,1failed. The test swaps the empty chosen directory immediately before ProjectService.create acquires it. NativeSetup later rejects the changed root, BUT `deployment.yaml`/history were already written into the replacement. The assertion expecting ENOENT fails because YAML exists.

Relevant code:
- `apps/desktop/src/native-setup.ts` confirm()
- `packages/application/src/services/project.ts` create()/open()
- `packages/project-fs/src/init.ts` initializeProject()

Planned next repair, NOT applied:
1. Thread the expected pinned RootIdentity from native confirmation through ProjectService.create into initializeProject.
2. If expected root is supplied and missing/replaced, reject before mkdir or any source/history write.
3. Compare canonical path/device/fileId on the opened SafeRoot before writes. Continue using checked SafeRoot I/O.
4. Consider the corresponding expected-root/project-ID validation in ProjectService.open before replacing current selection. Preserve old call behavior when no expected identity is supplied.
5. Run the new failing regression, init/security tests, historical parity and packaged CLI verification as appropriate.

Do not weaken the test or claim the later post-write check is sufficient. Preserve the documented portable same-user race limitation; do not claim kernel confinement.

### P1: resumable partial setup and lost-success-response recovery

Current confirm() creates/opens project, changes epoch, persists permissions, then imports inputs sequentially. A later failure can leave earlier imports/grants committed. UI refreshes its session only after total success. Another Continue gets PROJECT_CHANGED. Native recovery/context synchronization can clear old broker selections, while privately prepared bytes have no accessible resume path. New prepare creates a fresh revision/mutation identity, risking duplicate work.

Required outcome:
- Retain original input bytes, target binding and stable per-input mutation/receipt identities through partial failure.
- Refresh client session independently of final success.
- Resume the same operation against the already-created/opened project, skip/reconcile committed inputs, and use existing evidence receipt/recovery semantics.
- A lost response after successful setup must not create another project, duplicate evidence, or require a new unrelated folder selection.
- Never regrant revoked authority silently. New material/root/destination changes still need the appropriate confirmation.

A likely design was being considered, NOT implemented or mandated: stable client intake intentId, explicit operation state/status/resume endpoint, locked unchanged payload once durable work begins, completed-operation readback, preserved per-input EvidenceInput/receipt metadata. Existing prepare payload still has only4fields. Decide the smallest complete solution from code and approved plan; do not mistake speculative discussion for finished implementation. Assess restart/reload behavior and retention explicitly rather than promising recovery not implemented.

Add regressions for a failure after the first committed input and a lost response after successful setup. Preserve existing source/evidence transaction safety; no reset/delete-to-retry workaround.

## Review and process status at handoff

- All visible collaboration subagents were completed. No agent was left editing.
- The last regression test process was confirmed terminal with exit1; it is the intentional RED root-swap test above.
- External Devin process was terminal exit0, but its log contains only a rejected non-interactive tool call. This is NOT a review pass.
- Log: `/Users/hansel/.gstack/projects/robopomelo/agentic-desktop-implementation/d4-storage-review.log`.
- Prompt: same directory, `d4-storage-review-prompt.md`.
- Log says: “rejected a tool call that requires confirmation… non-interactive mode.” Do not blindly switch to dangerous permissions. Use an appropriate read-only review path or another independent reviewer.
- Native setup/intake spec reviewer reported the two P1 findings above. They remain open.
- Grant/credential spec review passed, but independent quality/security review of those components is still incomplete.
- Whole-branch implementation review and strict release-owned reviews have not run for this iteration.

Known parser lessons already fixed: cache WebContents before destruction; parent watchdog must bound native-modal hangs; wait for actual rendered UI/fonts before screenshots; DOM ArrayBuffer transfer to MessagePortMain produced null, so bounded previews use structured cloning; configure local compressed CMaps as well as fonts.

## Remaining implementation, preserve full scope

Checkpoint order from approved plan:

- C1: finish D3/D4 and A1/A3/A4. Native intake -> connected adaptive question -> traceable draft. Credential/connection lifecycle and real authorized provider tests remain.
- D0/A2: pinned Codex/Grok capability and live containment proofs can run independently; requested account integrations still need acceptance for full delivery.
- C2: S1 spatial extension/typed atomic authoring, S2catalog/geometry, S2b early50-robot spike, S3editor, S4motion/collision.
- C3: A5bounded exploration, S2areusable asset draft/promotion, S5fleet scheduling/reservations, S6objectives/comparison/playback/performance.
- C4: R1export, R2actual Isaac reference execution, R3whole-experience QA, R5second-engineer continuation/competitive benchmark.
- C5: R4release identity/installer/updates, then exact ship/land/publication verification and main reconciliation.

Do not redefine completion as the current intake foundation. Connected AI,3D/top-down editing,50-robot experiments, reusable assets, Isaac execution and signed release are still required.

## External gates and prior release facts

Hansel has no compatible RTX host/GPU runner. Continue all Mac/local/CI checks. Actual Isaac execution requires an authorized borrowed or temporary rented compatible machine. Prepare a concrete reproducible test package and cost cap before asking to spend; no cloud spending/provisioning is authorized. Do not claim export syntax checks are Isaac runtime acceptance.

No valid Developer ID signing identity was established earlier. Dev Electron tests proceed, but signed/notarized distribution and stable Keychain identity remain G5/R3 gates. Do not repeatedly ask vague auth questions or treat “done” as proof; inspect exact authoritative state.

Provider metadata only: isolated Codex0.153.4 exists at `/Users/hansel/.cache/robopomelo-build/codex-0.153.4/node_modules/.bin/codex`; global Codex was0.145.0 and refused the configured GPT-6 model. Grok metadata was1.0.13. OpenRouter public inventory returned430models during earlier research. These are historical metadata observations, not accepted adapter pins or live auth proof. Revalidate before relying on them. Grok macOS sandbox network limitations and Codex readable-root/tool restrictions need real canaries. Do not read/copy user auth files.

The old v1 release is complete and should not be redone. Stable1.0.0/latest freshly verified at handoff. Trusted npm publisher was configured for exact repo/release.yml. New desktop release must use reviewed new version semantics, signed candidate acceptance and actual published-artifact checks. Never republish existing1.0.0/RCversions or change tags to bypass a failing gate.

## First actions for the next LLM

1. Confirm exclusive ownership and this exact dirty worktree/branch/HEAD. Read AGENTS and the plan files.
2. Inspect current diff, especially the new root-swap test. Preserve all files.
3. Fix expected-root validation before initialization writes and verify RED->GREEN.
4. Implement complete partial-setup/lost-response recovery with regression evidence.
5. Complete focused review of repairs and independent D4 quality review.
6. Finish visible-intake visual/accessibility/native QA and credential/connection integration; commit green coherent changes.
7. Continue through all remaining approved checkpoints. Stop only for a real unresolved gate requiring human/external action, not because a small subset is green.

Communicate concise progress at least every60seconds. Explain outcomes and limits without claiming broad completion from narrow tests. Ask one material question at a time only when genuinely necessary. Do not ask Hansel to repeat settled approvals or authentication actions.
