# Autoplan phase 1: CEO review

Date: 2026-09-05. Branch: feat/v1. Baseline: d054f80. Mode: SELECTIVE_EXPANSION under the approved full-v1 boundary.

Status: phase complete at the plan level. Focused independent confirmation passed the six findings at 89/100; two minor import/ordering corrections were applied. No implementation or passing product test is claimed.

## System audit and context

The repository has one documentation bootstrap commit, no application source, no stashes and no remote yet. Current work is the approved design, six implementation subplans and the visual design system. The working tree's untracked plans were read explicitly; an empty tracked diff was not treated as an empty change.

There are no previous product modules to reuse or regress. The user has repeatedly selected full v1, complete browser/CLI/wizard parity and model-free local operation. Customer discovery is intentionally after the first full build; no customer evidence exists today. Market advantage remains a hypothesis, not an acceptance-test result.

The existing documentary patterns worth preserving are the explicit supersession table, the distinction between readiness and operator decisions, and the phase-specific roadmap gates. The initial plan's weak patterns were record-only validation that could pass empty collections and an underspecified restore operation. Both are corrected in the integration contracts before implementation.

## Step 0: premises, alternatives and scope

### 0A: premise challenge

The useful outcome is an engineer handing another engineer a structured plan with needs, decisions, uncertainties, ownership and acceptance criteria. Generating more files is only a proxy; the handoff must retain enough meaning to reduce reconstruction. The new minimum-review table prevents the obvious false proxy of an empty but schema-valid document receiving a ready label.

The premise that practitioners will prefer this workflow is unvalidated. Building first is a conscious user decision, not a premise the reviewer may silently reverse. The post-release protocol now has a concrete second-engineer handoff rubric and a continuation threshold, without creating a discovery prerequisite.

Doing nothing would leave the desired tool and public specification unbuilt; it would not establish whether the need is real. Simulation and hosted collaboration could make a more expansive product, but they would contradict the chosen first outcome and operating constraints. Preserve the current scope.

### 0B: existing-code map

| Subproblem | Existing asset | Decision |
| --- | --- | --- |
| Domain rules | Approved specification and RP catalogue, no implementation | Implement once in core |
| Structured persistence | Node FS/streams/crypto; YAML AST library | Reuse primitives, build explicit project transactions |
| Browser rendering | React/Vite and native controls | Bundle assets; no hosted runtime |
| Package authenticity | Maintained Sigstore/npm verification | Reuse cryptography and assert expected verified identity |
| Interactive terminal | Node readline | Avoid a shipped native TUI dependency |
| Release process | Installed gstack ship/land skills and GitHub/npm | Use required workflows, no duplicate release review |

### 0C: dream-state mapping

```text
CURRENT                       THIS PLAN                       FUTURE WITH EVIDENCE
Approved documents      ->    Local engineering reasoning ->  Layout/capacity/adapter inputs
No product/customer proof     Portable review + handoff       Versioned test-run evidence
                              No physical writes              Planned/actual comparisons
```

V1 establishes the stable linking and uncertainty model that future adapters need. It intentionally leaves engineering asset acquisition and simulator-specific conversion outside the application. The difference from a generic form builder is the combination of challenge questions, linked coverage, explicit open issues and revision-bound decisions.

### 0C-bis: alternatives

| Approach | Effort and risk | Benefits | Costs | Decision |
| --- | --- | --- | --- | --- |
| A: one package with internal folders | Human L / agent M; moderate coupling | Fewer workspace manifests; can reuse the same core | Weakens the approved package boundaries; interface coupling becomes easier | Reject in favor of approved structure |
| B: shared core plus private workspace adapters, one public artifact | Human XL / agent L; explicit integration effort | Full approved parity and separation; one release train; replaceable surfaces | More contract tests and build configuration | Select; completeness 10/10 within approved scope |
| C: static browser/filesystem prototype | Human M / agent S; high platform/scope mismatch | Short path to a browser demo | Cannot satisfy native terminal/server/trust/update contracts across supported browsers | Reject; does not meet full scope |

The selected approach is B. It preserves the already approved architecture and uses small standard building blocks where possible. This is not a decision to add an SDK, hosted platform, model service or native security sandbox.

### 0D: selective expansion and complexity

This project exceeds eight files and two services because the user explicitly requested multiple complete interfaces and a portable transactional runtime. Consolidation occurs in shared contracts, one transaction implementation and one field/question registry. Removing an interface to reduce file count would change approved scope rather than simplify its implementation.

Five small experience improvements are already inside scope: finding-to-field navigation, preserved unsaved text on conflict, explicit unknown labels, export file preview and exact installed-version feedback. Retain them as completeness work. Defer simulator launch buttons, cloud collaboration, paid tiers, SDK publication and unrelated native sandbox infrastructure.

### 0E: temporal interrogation

Hour 1 foundations need exact schema/types, Node floors, package paths and ownership. Hours 2-3 core work need container-level readiness applicability and protected decision/restore semantics. Hours 4-5 integration need one Mutation transaction API and consistent evidence/Scope field names. Hours 6+ release work needs allocated native/browser/AT evidence, actual registry authorization and channel verification. These are human-team sequencing labels; agent execution duration remains subject to actual test and external-service outcomes.

### 0F: confirmed mode

SELECTIVE_EXPANSION retains the approved baseline and accepts only fixes inside its direct correctness boundary. All six native-review findings have coordinator-owned fixes or explicit external dependencies. No user-specified capability is removed.

## Outside review evidence

Codex CLI auth succeeded but its configured-model probe returned MODEL_UNUSABLE with unknown gpt-6-astra model/cache messages. Claude CLI returned `Failed to authenticate: OAuth session expired and could not be refreshed`. Neither is represented as a completed review, and global tool configuration was not changed.

Autoplan's documented unavailable-voice fallback applies. A fresh, read-only native Codex agent supplied independent same-model feedback: three P1 and three P2 findings, initial quality 72/100. This is supplemental independent review, not Claude feedback or model diversity.

| Dimension | Claude CLI | Codex CLI | Independent native review | Assessment |
| --- | --- | --- | --- | --- |
| Premises | Unavailable | Unavailable | 8/10 | Scope intentional; demand unvalidated |
| User outcome | Unavailable | Unavailable | 7/10 | Minimum-review gap required correction |
| Scope/feasibility | Unavailable | Unavailable | 6/10 | Delivery/native evidence needed owner plan |
| Alternatives | Unavailable | Unavailable | 7/10 | Shared core fits; advantage remains hypothesis |
| Market risk | Unavailable | Unavailable | Explicit uncertainty | Post-release rubric added |
| Trajectory | Unavailable | Unavailable | Clarity 9/10, consistency 6/10 | Restore and transaction contracts corrected |

No cross-model CONFIRMED count is reported. Missing voices are N/A.

## Section 1: architecture

```text
spec/schema/registries -> core validation/patch/review/hash
                              |                 |
                       project-fs         artifacts
                       transactions         |
                              +---- CLI/server ---- web
                              +---- terminal wizard
                              +---- Skills via CLI
machine settings -> trust        machine cache -> verified updater -> exact runtime
```

The integration plan now names the generated public distribution and every coordinator-owned CI/release file. The core remains free of filesystem/network/model calls. The real coupling is explicit: all surfaces rely on the same typed Snapshot and Mutation contracts. A restoration is an authoring transformation against current state, not a raw replacement of the whole YAML snapshot.

At 10x record volume, repeated whole-project indexing and rendering would fail first; build shared indexes once and bound lists/exports. At the configured record/byte limits, reject excess clearly. The single local source is a deliberate point of coordination, protected by journaled transactions and recoverable snapshots rather than a hidden database.

## Section 2: error and rescue registry

| Path | Named failure | Action | User sees | Planned evidence |
| --- | --- | --- | --- | --- |
| Parse source | SOURCE_UNREADABLE / INPUT_LIMIT | Preserve bytes; inspection view | Location and recovery choices | Malformed/duplicate/alias/depth fixtures |
| Validate records | SPEC_BLOCKED / UNSUPPORTED_SPEC | Return typed report | Specific RP finding or compatibility action | All 27 rules plus sparse counterexamples |
| Apply mutation | BASE_CONFLICT / SCOPE_DENIED | No source write; preserve proposal | Current/base identities and next action | Stale/protected-field tests |
| Acquire lock | LOCK_HELD / LOCK_UNCERTAIN | Do not steal unproven ownership | Owner/recovery guidance | Real competing-process tests |
| Commit | IO_ERROR / RECOVERY_REQUIRED | Resolve journal by actual hashes | Saved or recoverable outcome | Injected failures around commit point |
| Copy evidence | FILE_CHANGED / PATH_ESCAPE / INPUT_LIMIT | Abort copy; preserve source | Selected-file error | Link/swap/size/stream tests |
| Record decision | REVIEW_STALE / REVIEW_INCOMPLETE | Preserve entered decision; no false approval | Missing acknowledgment or stale hash | Review-operation integration tests |
| Restore | SCOPE_DENIED / EVIDENCE_UNAVAILABLE | Preserve current review history | Protected difference or missing file | Revocation/obligation restore tests |
| Export | EXPORT_CHANGED / IO_ERROR | Abort partial output | Retry with preserved selection | Stream/hash/ZIP tests |
| Update | RELEASE_UNVERIFIED / NETWORK_ERROR | Keep verified current runtime | Update failed; project remains usable | Wrong identity/digest/offline tests |
| Publish/promote | AUTH_REQUIRED / RELEASE_UNHEALTHY | No stable promotion | Exact external dependency | Actual registry and install readback |

Outer adapters map named failures to stable HTTP/CLI outcomes and safe diagnostics. Catch-all unexpected exceptions become an internal failure, not an empty result or success. Project content, credentials and launch secrets are not included in generic logs. No LLM response path exists in the application; external agent patches enter through the same untrusted typed boundary.

## Section 3: security and trust

High-impact in-scope threats are cross-origin local-server access, path/link escape, arbitrary active-content rendering, privilege changes through restore/patches and malicious update payloads. Each now has a named owner and planned negative test. Operator identity remains asserted; scoped authoring does not imply actual acceptance or verified evidence.

The same-user hostile-process limitation is explicit, so a new cross-platform native sandbox is not silently added. The real path APIs still check at operation time and prevent permitted HTTP/patch operations from creating link-swap primitives. Restore preserves current revocations and enforces protected-field authority; that resolves the identified integrity-design gap without reducing functionality.

## Section 4: data and interaction shadow paths

```text
author input -> schema/scope/base -> candidate + findings -> journaled commit -> snapshot
   null       invalid/unknown       incomplete draft       conflict/disk error  lost response
   |          |                     |                      |                    |
explicit      actionable error      save with blocked      preserve candidate   reconcile ID
missing       no mutation           readiness              and source           before retry

source+selection -> frozen handles -> render/hash -> stream ZIP -> atomic final output
   empty/blocked      missing/change     escape text   abort/limit     no partial success
```

Double-submit uses change IDs and immutable proposal digests. Navigate-away waits for save or preserves the draft with Stay/Retry/Copy. Empty lists remain actionable, wide tables are bounded, and project switch rotates the active project epoch so old requests cannot land in the new root. These are all interface-visible consequences of shared runtime behavior, not parallel frontend business rules.

## Section 5: code organization

No existing product code needs refactoring. The package/field registry prevents three independently implemented workflows, while specialized record editors handle the genuinely different quantity/criterion/flow shapes. The root contract now imports shared Actor, Scope and EvidenceObservation types everywhere and adds evaluateReview/Mutation rather than a CLI shortcut for privileged writes.

Files are split by responsibility under 400 source lines. Generated schemas/distribution assets are distinguished from authored source. Avoid a generic arbitrary-field router, opaque event-sourcing framework, custom cryptography or a second project catalogue.

## Section 6: test review

```text
UX: welcome -> five steps -> review/decision -> export       browser + real TTY + CLI
Data: JSON/YAML -> schema -> rules -> snapshot              unit + contract + integration
Authority: patch/review/restore/trust                       negative scope + revoke races
Storage: lock -> journal -> replace -> recover              process races + crash injection
Outputs: source -> documents -> manifest -> ZIP             golden + timezone + hash readback
Async: autosave, watcher, evidence stream, update staging   timer-controlled + real failure cases
External: npm publication/provenance/channel               signed fixtures + actual registry install
```

The Friday-night confidence test is the installed package completing the reference flow, restoring across a revoked approval, and exporting bytes whose hashes match the manifest. The hostile test is an untrusted project or patch attempting to escape paths, grant authority or execute downloaded code. The chaos test kills a writer around source replacement and verifies one valid recoverable outcome.

Tests are currently planned, not executed. Most semantics belong in unit/integration tests; a smaller complete-process suite validates cross-surface parity. Inject clocks/IDs/network failure in deterministic tests and use real subprocess/filesystem tests for the boundaries mocks cannot establish.

## Section 7: performance

The largest work items are schema/index validation near the record limit, streamed evidence hashing and ZIP generation, and runtime-package verification. Use one reference index per snapshot, bounded parser depth/size, streaming attachments and no full 2 GiB archive buffer. Browser list pagination or bounded rendering prevents all record editors mounting at once.

Measure actual launch/edit/validation/export durations with declared fixtures/hardware. Do not write speculative p99 numbers as achieved results. A slow update check is bounded and cannot block offline project use.

## Section 8: observability

The application exposes local save/revision/recovery state, last update outcome and structured errors rather than remote telemetry. A change ID links the browser/CLI request to a committed revision or preserved proposal. Doctor and explicit diagnostics explain local dependencies without scanning unrelated files or transmitting project data.

Recovery/update/security errors have documented next actions and evidence paths. This provides useful local diagnostics while honoring the no-analytics boundary. Publication evidence separately records workflow, source SHA, package digest and registry/channel readback.

## Section 9: deployment and rollback

The coordinator delivery plan now owns workspace tooling, protected remote baseline, native CI, exact package artifacts, RC/stable sequence and final synchronization. Gstack's stable version helper is retained; a generated public artifact derives the preapproved rc.1 suffix from the single 1.0.0 release target. No installed global gstack code is altered.

Npm authentication and channel-promotion capability remain external release dependencies, not build blockers or evidence of impossibility. Candidate/stable artifacts are separately verified. Failed verification preserves the working runtime and prevents default-channel promotion; project migration and runtime rollback remain separate explicit operations.

```text
source checks -> ship review/version/PR -> CI -> land -> RC artifact -> published RC checks
 -> stable artifact checks -> verification tag -> registry install/provenance -> latest -> readback
failure at any release gate -> stop promotion, preserve evidence and working runtime
```

## Section 10: trajectory and learning

The architecture keeps v1 useful without Git, a model, a cloud account or a simulator. Versioned contracts and extension preservation make later layout/adapters/results possible without implementing them prematurely. Reversibility is 4/5 for internal modules and 2/5 for a publicly published schema/package, which is why release gates and compatibility records matter.

The post-release test compares a bounded AMR task with the practitioner's existing method and asks a second engineer to use the handoff. Its rubric and four-of-five continuation threshold guide subsequent work without claiming statistical validation. Missing evidence prioritizes the basic workflow, rather than automatically expanding to adapters.

## Section 11: design and UX

The selected Editorial Studio direction serves the document and open issues first, followed by context and technical detail. The eleven-screen map includes loading/empty/error/success/partial states, separate approval status and preserved-conflict inputs. Forms and print views avoid robot-control styling and physical-readiness claims.

```text
Welcome -> [Frame -> Flow -> Success -> Requirements -> Acceptance] -> Review/export
                 ^                    |                                  |
                 +----- finding link -+                                  +-> supplied decision
Project navigation -> Changes / Evidence / History / Settings              +-> handoff ZIP
Any write -> Saving -> Saved | Failure/Conflict -> Preserve + resolve
```

Three generated candidates were visually inspected and the approved design direction informed selection. The optional automated image checker returned credit exhaustion and was not counted as a pass. Actual browser, print, keyboard and screen-reader verification remains required after implementation.

## Failure modes and tasks

| Failure | Resolution in plan | Evidence required |
| --- | --- | --- |
| Empty document appears ready | Minimum content/applicability table; RP-013 and RP-042 | Sparse and not-applicable fixtures |
| Restore resurrects approval or removes obligation | Current review/revocations preserved; checked authoring diff | Restore across revoke/protected obligation |
| Review operation bypasses core | Shared ReviewCommand/Mutation/evaluateReview | CLI/server protected-operation tests |
| Release exists only as an intention | Coordinator delivery plan and actual external readback | CI/package/channel/source evidence |
| Unsupported native/browser claim | Allocated versioned executor matrix | Real platform/AT evidence |
| No learning from a full build | Post-release comparator/rubric/threshold | Permissioned practitioner observations |

Implementation tasks: C1 enforce minimum readiness; C2 enforce restore authority/history; C3 reconcile shared review mutation types; C4 implement coordinator CI/distribution plan; C5 record actual native/browser/AT evidence; C6 use the post-release learning protocol. C1-C5 are within v1 delivery. C6 is post-release work and authorizes no outreach by itself.

## Scope and completion summary

No new product scope was accepted. Deferred items are SDK, layouts/capacity, simulator/interface adapters, test execution/results and telemetry, all already covered by roadmap gates. Hosted collaboration, paid messaging and physical control remain excluded. All initial diagrams describe a planned system and require implementation-era maintenance.

Primary review evaluated all eleven sections, mapped eleven error paths and six principal failure modes, and produced architecture, state/data, test and release diagrams. Initial independent findings were three P1 and three P2. Corrective plan changes address them; focused independent confirmation passed at 89/100. Outside CLI voices remain unavailable and are not treated as agreement. The final autoplan gate will reflect actual confirmation and any remaining material issues.
