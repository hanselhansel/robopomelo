# Agentic desktop sequential review record

Date: 2026-09-07. Target: [root plan](../2026-09-07-agentic-desktop.md) and its four linked implementation/contract files. Approved [product design](../../specs/2026-09-07-agentic-desktop-design.md) is the scope boundary. This record describes planning evidence, not passed implementation tests.

## Review setup and provenance

Deep tier because this changes native privileges, model/network access, project authoring, simulator semantics and distribution. Use autoplan's CEO -> Design -> DX -> Engineering order. Existing visual ideation already produced three options and the approved combined mockup; do not regenerate alternatives during review.

Independent bounded research inspected Codex 0.145.0/Grok 1.0.13 local help and current first-party protocol docs, and current spatial/source/export code. Research is not an independent security certification. Claude CLI reports loggedIn:false, so a Claude outside voice is unavailable; no login prompt or fabricated dual-model consensus. Codex CLI outside voices, if successful, are independent context using the same model family, not cross-model agreement. General tooling upgrade availability is outside this plan's blast radius and is deferred.

Restore point: the initial root plan is retained outside the repo at `~/.gstack/projects/robopomelo/agentic-desktop-plan/autoplan-restore.md`. Released main was compared to live GitHub and matched cafb740. Planning is on a clean dedicated documentation branch at creation.

## Phase1: product/CEO review

Mode: selective expansion under the approved scope. Accept no unrelated feature expansions. Existing boundary/recovery behavior is an asset, not boilerplate to replace.

### Premises and alternatives

The user's observed path/permission friction is direct product feedback; wider practitioner demand is still unvalidated. An agentic desktop may improve that experience, but simulator breadth can obscure the central requirements-to-handoff goal. Preserve the bridge outcome in the benchmark rather than equating a rendered50-robot scene with product-market fit.

OpenUSD interchange does not transfer task/controller behavior automatically. Asset reuse also does not imply redistribution rights. Both assumptions are corrected through explicit adapter/loss reports, pinned assets and real target execution. Grok's native sandbox is not a confidentiality boundary on macOS; G1 is a feasibility gate.

The root plan compares browser-only, Electron/shared Node and Tauri/sidecar approaches. Electron is selected for fastest coherent reuse with a larger distribution/security maintenance cost. The ideal longer-term modular service is extracted only once and shared by CLI/desktop. No second project format, physics engine or hosted backend is introduced.

```text
current: source-first planning forms + deterministic CLI/core
plan:    native setup + adaptive discovery + editable scenes + reproducible fleet/Isaac handoff
ideal:   verified practitioner workflow with more target adapters and evidence/results integration
```

Temporal check: foundations need explicit broker/contract boundaries; core work needs units/capability/reference rules; integration needs provider containment and native callback lifecycle; final QA needs actual GPU/signing access. Those dependencies are now gates rather than late surprises. Relative effort is large; no unsupported human-to-agent speed ratio is promised.

### 1. Architecture

Examined existing server/application/project-service and ProjectSession paths. The shared application extraction preserves receipt/epoch/origin behavior while avoiding desktop imports of a private CLI implementation. The architecture diagram and four-path/state diagrams are in contracts/root plan; utilityProcess is explicitly not labeled a sandbox.

### 2. Error and rescue map

The contracts registry covers chooser cancellation, auth expiry, provider refusal/empty/malformed output, source conflicts, lost receipts, input limits, missing assets, deadlock, budget exhaustion, target absence and update failure. Every row has a visible recovery action. Secrets and project content are excluded from diagnostic logs even where generic skill guidance would otherwise request full arguments.

### 3. Security

Main risks are renderer privilege escalation, malicious documents/assets, provider ambient authority, private-query leakage and forged source/approval actions. The plan requires closed IPC schemas, exact sender/origin checks, parser isolation, version-gated account adapters, a structured public-topic broker and core mutation validation. Residual provider storage/containment feasibility remains an explicit gate, not a solved fact.

### 4. Data and interaction edges

Reviewed null/empty input, cancelled dialogs, failed extraction, stale answers, late callbacks, manual/AI races, duplicate requests and project switching. Intake buffers survive recoverable setup failures; all asynchronous results bind run generation and source revision; unknown values never become measured facts. Each effect has one canonical write path.

### 5. Code quality

New boundaries are spec/core, pure spatial/simulation, filesystem persistence, provider adapters, application services and desktop host. The current boundary checker ignores unknown packages, so D1 closes that gap before introducing them. Source files remain under400lines. Avoid a universal plugin execution framework and an unneeded Rust mirror of TS business logic.

### 6. Tests

Coverage maps each product requirement to tasks and separates deterministic fixtures, live provider canaries, real desktop QA and actual Isaac execution. The test plan includes adverse geometry and task-conservation cases, not just a screenshot or sample animation. No new implementation test is claimed passed during planning.

### 7. Performance

Likely expensive paths are PDF/mesh ingestion, pose-aware path search and repeated provider requests. Limits precede decoding/dispatch, workers cap concurrency, geometry instances share meshes and result reuse uses semantic hashes. Explicit M4 / 24 GiB performance targets replace unmeasured claims.500robots or100x input is unsupported, not silently accepted until memory exhaustion.

### 8. Observability

Run/source IDs, sequence numbers, typed errors, cancellation state, usage availability and immutable manifests let an engineer reconstruct a local failure. No product telemetry service is added. Logs distinguish process exit, timeout, schema refusal and unknown durable outcome; successful renderer state alone is not completion.

### 9. Delivery and rollback

Old-reader and signed-desktop update tests precede source migration/promotion. Desktop updater owns the whole signed bundle; CLI self-update cannot replace its service. Original project bytes/asset versions remain recoverable. R4 specifically handles existing-version and registry-read eventual consistency without blind republishing.

### 10. Long-term trajectory

Asset IDs, source linkage and target profiles support later Gazebo/Open-RMF/evidence work without forcing a full simulator into the local app. Electron host is replaceable with moderate effort because business logic stays outside it. The irreversible choices are public contracts and stored semantics; G2 and version review protect these.

### 11. UX

The approved split workspace is the target. Its still image omits onboarding, conflict and partial/error states, now covered by the screen/task inventory. Simulation requires inspectable reasons and numeric alternatives to dragging. macOS-first is intentional; no Windows desktop or unsupported mobile claim is smuggled into layout testing.

### Product completion summary

Scope preserved; architecture alternatives assessed; all11review sections examined; existing-code reuse map, state/data diagrams, error/rescue registry, performance and release dependency gates produced. User challenge: exact Grok containment may be infeasible under available interfaces; preserve the desired capability and require actual proof before advertising. External signing/GPU availability does not invalidate the product premise but can block full release.

### Failure modes registry

| Failure | Consequence | Required closure |
|---|---|---|
| Attractive scene without usable handoff | Product duplicates existing scene tools | R2 actual controller/task run plus handoff benchmark |
| Provider reaches ambient files/search | Confidentiality breach | G1 canaries and mediated tools; unavailable adapter otherwise |
| Older client ignores spatial intent | Invalid edit/approval/export | G2 actual published-v1 matrix; explicit migration if required |
| Drag/model race | Lost user changes | Source base + generation + existing receipts |
| Planning model misses swept collision | Misleading feasibility result | Conservative sweeps plus independent trace checker |
| Budget UI promises unavailable metering | Unexpected spend | Pre-dispatch turn/token/time limits and honest unknown costs |
| Missing RTX/signing access | Claimed release without proof | G4/G5 remain blocking; no mock substitute |

## Decision audit trail

| ID | Phase | Decision | Classification | Rationale / rejected alternative |
|---|---|---|---|---|
| D1 | Product | Electron/shared Node host | Taste | Existing TS/core reuse; Tauri adds sidecar/language burden |
| D2 | Product | Preserve all agreed scope but deliver vertical slices | Mechanical | Avoid treating first UI slice as full iteration |
| D3 | Product | Account adapters fail closed pending containment | Feasibility | Native read-only/sandbox labels do not establish isolation |
| D4 | Product | Public-topic query templates | Taste | Enforce confidentiality beyond model/regex redaction; custom query review remains |
| D5 | Product | Spatial required capability and actual old-reader tests | Mechanical | Preserve source semantics and block unsupported edits |
| D6 | Product | Two-Jetbot Isaac execution fixture, separate50-robot local workload | Taste | Proves real controller handoff with a bounded initial target |
| D7 | Product | Explicit GPU/signing gates | Mechanical | External resources have not been established |
| D8 | Product | Field-level RequirementBinding | Mechanical | Close the requirements-to-simulation continuity gap |
| D9 | Product | Full asset draft/composition/promotion lifecycle | Mechanical | Preserve approved reusable-asset scope |
| D10 | Product | Scored counterfactual discovery evaluation | Taste | Test adaptive relevance in addition to valid JSON |
| D11 | Product | R5second-engineer benchmark | Mechanical | Verify handoff outcome; unavailable comparisons remain unmeasured |
| D12 | Product | Early50-robot kernel feasibility | Mechanical | Measure expensive assumptions before full engine build |
| D13 | Product | Integrated checkpoints | Mechanical | Get real workflow feedback before subsystem expansion |
| D14 | Design | Binding source/override controls | Mechanical | Preserve visible provenance while editing |
| D15 | Design | Explicit retention matrix | Mechanical | Prevent lost input and stale auth authority |
| D16 | Design | Subject-based question invalidation | Taste | Preserve useful questions and bounded proactive work |
| D17 | Design | Frozen baseline and explicit export selection | Mechanical | Prevent silent scenario/result substitution |
| D18 | Design | Keyboard/numeric scene model | Taste | Precise access without drag-only interaction |
| D19 | DX | Disconnect/cleanup lifecycle | Mechanical | Connection removal must actually disable use |
| D20 | DX | Exact command/service inventory | Mechanical | Avoid divergent desktop/CLI/Skill semantics |
| D21 | DX | Checked contribution manifests | Mechanical | Make reusable assets/adapters extendable with evidence |
| D22 | DX | Bidirectional version matrix | Mechanical | Unknown formats stay preserved and unavailable |
| D23 | Engineering | Parser byte-transfer bridge | Mechanical | Selected bytes reach isolated parser without arbitrary file-read IPC |
| D24 | Engineering | Reject invalid PRNG seeds | Mechanical | Remove implicit seed alias and zero-state risk |
| D25 | Engineering | Explicit dependency and capability map | Mechanical | Close unknown-owner and root-extension write gaps |
| D26 | Engineering | Numeric exit mapping and partial manifests | Mechanical | Preserve existing machine semantics and cancellation results |

## Phase1 external review amendment

Hansel authorized Devin CLI as the external reviewer after the original CLI availability failures. Devin completed a read-only independent CEO review (exit0) with six findings. All were verified against the plan and incorporated: RequirementBinding; full asset drafting/composition/promotion; scored adaptive-question evaluation; R5 continuation/competitive benchmark; earlyS2bfeasibility; integrated checkpoints. Source log retained outside repo at `~/.gstack/projects/robopomelo/agentic-desktop-plan/ceo-devin.log`. These are primary-plus-Devin reviewed amendments, not Claude/Codex dual-model consensus. None reduce user scope.

## Phase2: design review

Phase1 outside voices: Claude unavailable (CLI reports signed out). Codex CLI was attempted read-only and rejected by the service: configured gpt-6-astra requires a newer CLI. No review content was returned. This is single-primary-reviewer mode; no cross-model consensus is claimed. The same unavailable prerequisites apply to later phases; do not repeatedly call them or prompt for account access during planning.

| CEO voice dimension | Primary assessment | Claude | Codex CLI | Consensus |
|---|---|---|---|---|
| Premises | Specific user friction; market evidence remains limited | Unavailable | Unavailable | Not established |
| Problem | Requirements-to-handoff continuity | Unavailable | Unavailable | Not established |
| Scope | User-approved scope retained with explicit gates | Unavailable | Unavailable | Not established |
| Alternatives | Three approaches compared | Unavailable | Unavailable | Not established |
| Competition | InOrbit/VisualComponents overlap recorded | Unavailable | Unavailable | Not established |
| Trajectory | Portable semantics and adapter interfaces | Unavailable | Unavailable | Not established |

Review target is the approved combined mockup and new task plan, not the old form-first UI. Classification: application workspace. No new visual option is needed because the user already selected and refined one.

### Pass1: information architecture,8/10

The three primary surfaces are conversation, scene/specification and selected-object context. Keep one question and one principal canvas action visible. The new plan had no explicit first-run route map; add the following map and let optional inspectors collapse before primary surfaces become unusable.

```text
Welcome(text/files) -> Native folder -> Recommended grant -> AI connection
  -> Conversation + Scene <-> Specification <-> Compare
        | selected object -> Inspector + context chip
        | asset catalog -> placement preview -> checked revision
        | run -> playback/events -> alternative -> choose/retain baseline
        +-> History/resume, Settings, Export report -> target package
```

### Pass2: interaction-state coverage,8/10

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Intake | File name and parsing progress | Describe/drop/browse | Per-file reason and retry/remove | Extracted sources | Parsed files retained beside failed ones |
| Connection | Provider name and cancel | Connect chosen provider | Reconnect without losing input | Model/source visible | Unsupported tools/modalities listed |
| Discovery | Specific progress plus Pause | First material question | Refusal/empty/schema shown distinctly | One active question and change summary | Known/unknown subjects visible |
| Scene | Asset count, retained camera | Add asset or describe space | Bad asset highlighted, rest retained | Selection and dimensions | Estimated dimensions visibly provisional |
| Simulation | Variant progress and elapsed budget | Run baseline | Affected jobs/resources and cause | Playback and measured metrics | Partial horizon and unfinished tasks |
| Compare | Results appear per variant | Explain required baseline | Failed variant retained with reason | Equivalent-workload alternatives | Stale or incomplete results labeled |
| Export | Preparing selected target | Choose target/profile | Missing assets/version/mapping report | Open package location | Importable-only with remaining setup |

### Pass3: journey and emotional arc,8/10

In the first5 seconds, the user sees the description/file action. Within5 minutes, a useful draft should be visible, with waiting on provider authentication or unsupported files explained. Returning weeks later must restore intent, sources and the last valid result, not require a fresh transcript prompt. The implementation plan adds a measured time-to-first-useful-draft benchmark; speed does not permit guessed measurements to appear confirmed.

| Step | User action | Intended feeling | Specific support |
|---|---|---|---|
| Begin | Describe or attach | Low setup burden | Native picker, retained intake |
| Discover | Answer next question | Understood, not interrogated | Adaptive subject resolution |
| Shape | Select/drag/type | Direct control | Ghost previews, numeric values, Undo |
| Compare | Inspect alternatives | Understandable trade-off | Same workload and visible assumptions |
| Handoff | Open target package | Continuity | Tested profile, source links, explicit limits |

### Pass4: generic-pattern risk,8/10

The approved scene is a strong visual anchor, with conversation relevant to a selected aisle/object. Its message/question cards must not become a dashboard of decorative cards. Use simple transcript rows and one emphasized actionable question; preserve source labels and readable contrast. Decorative shadows/photorealism are optional; understandable geometry and controllable selection are mandatory.

### Pass5: design-system alignment,9/10

Retain existing SourceSans3/SourceSerif4, warm ivory, leaf-green actions and coral decoration from DESIGN.md. Rendering colors cannot be the sole robot/status distinction. Existing document/print behavior remains reusable; the new scene does not justify rewriting the document exporter or introducing a conflicting visual vocabulary.

### Pass6: responsive/accessibility,8/10

At1440x1024 show full split layout; at1280x800 retain both primary surfaces and collapse optional drawers; at1024x700 constrain transcript width and expose expand actions. Below minimum desktop width, show resize guidance. Browser/CLI legacy views retain their existing responsive contract. Use semantic question forms, label all controls,44px effective targets, keyboard object movement and a structured object/event list as an alternative to visual navigation. VoiceOver and reduced-motion paths must run in R3.

### Pass7: unresolved design decisions,8/10

Resolved in plan: cancelled OAuth retains intake; expired questions become noninteractive history; running variants do not overwrite the baseline; edits mark affected results stale; camera changes do not change deployment intent; missing costs stay unknown. Pending UX claims are empirical usability and agent-question-quality results, not designer intuition. No interface should promise a route connection/model capability that G1 has not established.

### Design litmus scorecard

| Test | Primary | Claude | Codex CLI |
|---|---|---|---|
| Product recognizable | Yes | Unavailable | Unavailable |
| Strong anchor | Yes, selected scene | Unavailable | Unavailable |
| Scan hierarchy | Yes, with prescribed state labels | Unavailable | Unavailable |
| One job per area | Yes | Unavailable | Unavailable |
| Cards justified | Conditional: question only emphasized | Unavailable | Unavailable |
| Motion purposeful | Yes, playback; reduced motion required | Unavailable | Unavailable |
| Works without decorative shadows | Yes | Unavailable | Unavailable |

Design phase complete: all7 dimensions examined, state/journey maps written, approved mockup retained. Scores reflect plan readiness, not executed frontend quality. No dual-model agreement claimed.

## Phase2.5: developer-experience review

Devin completed the external design review on retry; the first invocation returned no content and is not counted. Five findings were verified: binding source/override UI, onboarding retention, question/composer invalidation, baseline/export selection and keyboard mapping. Contracts now specify each. Two suggestions were refined: invalidate only affected semantic dependencies rather than all revisions, and retain bounded proactive re-evaluation rather than disabling the approved autonomy. External log: `design-devin-retry.log`. This completes Phase2 with primary-plus-Devin input; no claim of executed UI tests.

### Persona and actual-path empathy

Primary developer persona is an AMR solutions engineer who also prepares simulator handoffs; secondary is an OSS contributor extending assets/adapters. The primary user should not need to understand JSON Schema or a Node runtime to start the desktop app. Contributor expectations are typed contracts, deterministic fixtures and reproducible local commands.

Developer perspective (roleplay grounded in current files, not an observed interview): “I open README.md and see Start a local workspace followed by npx robopomelo. Today that means I need a supported Node installation. The new desktop download should remove that prerequisite for planning. I want to bring a floor plan, choose a folder and see the first useful question without understanding inspect/author scopes. If I cancel login, I expect my description and files to remain. When an estimated width appears, I need to see where it came from and correct it directly. I expect changing a station to explain which results need rerunning. When I export for Isaac, I need exact target versions and a useful unsupported report; a beautiful USD preview would not tell me whether the robot controller can execute the tasks. As a contributor, I want to run pure tests without signing credentials or a GPU, then see clearly which live gates I have not exercised. I need the API names and sample errors to match what the installed version actually returns.”

### Nine-stage journey

| Stage | Action | Friction/response |
|---|---|---|
| Discover | Read README/product purpose | Name planning/handoff outcome and measured limits |
| Install | Download signed macOS app | Node not required for desktop; CLI remains explicit |
| First value | Open fictional example | Editable scene without external AI account; target<=2 minutes after install |
| Connect | Select provider/account | Required provider setup visible; one current callback; retain intake |
| Real use | Attach notes, answer and edit | One active question and field-level evidence |
| Debug | Inspect failure | Problem/cause/recovery with bounded IDs and no secrets |
| Extend | Add catalog asset/adapter | Typed schema, example, validation command |
| Handoff | Export and run target | Declared runtime/profile, precise unsupported report |
| Upgrade | Install signed update | Preserve project state; explicit migrations only |

### Eight DX passes

1. Getting started,8/10. Existing CLI requires Node, but the proposed signed app does not. Add a no-account fictional example path as first-value fallback, with actual local scene/validation rather than a screenshot. Measure<=2 minutes from installed-app launch to editable example and<=5 minutes to first useful connected draft excluding user-controlled authentication wait. These are targets; current timing is unknown.
2. API/CLI/SDK,8/10. Preserve existing command names, JSON envelope, receipt recovery and explicit project scope. Add documented scene/run/export commands through the same service, and show capability/version support. A contributor must not drop into unrestricted native IPC for an ordinary operation.
3. Errors/debugging,8/10. Trace three paths: expired auth -> retained input and reconnect; stale mutation -> source comparison with the same receipt identity; unsupported Isaac profile -> specific missing asset/drive/version and export options. Prefer problem/cause/action before technical details. Logging entire arguments would leak data, so diagnostics stay bounded.
4. Documentation,8/10. README routes desktop users to native setup and contributors to existing npm commands. Add desktop tutorial, provider capability matrix, asset-authoring example, fleet fixture and target handoff tutorial with exact tested versions. Doc examples run in CI; unsupported third-party behavior is labeled.
5. Upgrade/migration,8/10. G2/R4 cover source preservation and signed bundle updates. A new app cannot silently turn an old author grant into AI permission or activate experimental capabilities. Version choice remains a prepublication decision based on actual compatibility proof.
6. Environment/tooling,8/10. Vitest/Playwright remain; pure model/geometry/scheduler tests run without accounts/GPU/signing. D0/R2/R3 are named live gates. Boundary checks require explicit owners, and performance reports name hardware rather than generic laptop claims.
7. Community/ecosystem,8/10. Existing public issues/PRs and Apache2 product scope remain. Supply one useful asset/template and adapter contribution path, with asset licensing separate from product license. No new hosted forum/telemetry infrastructure is introduced.
8. Measurement/feedback,8/10. R5 measures continuation and omissions; C1-C4 checkpoints expose friction early. Use volunteered observations and local reports, never automatic product telemetry. Model quality, engineering fixtures and actual customer evidence remain separate.

### DX implementation checklist

- [ ] Add no-account fictional example route and actual editable scene to D3/S3.
- [ ] Preserve CLI JSON/status/receipt contracts in D2; test finite commands separately from interactive desktop.
- [ ] Add versioned native tutorial, connection matrix, asset/template example and Isaac handoff guide in R3.
- [ ] Run measured first-value/connected-draft tasks and R5 continuation protocol; report missing account/hardware time separately.
- [ ] Keep generated Skills narrow, schema-version aware and bound to the same core actions. Do not embed provider credentials or unbounded shell recipes in a Skill.

Primary DX review complete. External Devin DX review follows these amendments before Engineering begins. Scores assess plan specificity; no competitive speed advantage or first-time success is yet measured.

## Phase3: engineering review

Devin's external DX review completed with four findings: disconnect lifecycle, exact CLI/service inventory, contribution contract and bidirectional format compatibility. All were verified and added in interfaces.md with exact task ownership and negative tests. Current vs future supported formats are distinguished; unknown members are preserved, not treated as supported. External log retained at `dx-devin.log`.

DX phase complete with primary-plus-Devin input. The next engineering pass reviews the fully amended plan. No scope cut or infrastructure purchase was made.

### Engineering1: architecture and current-code evidence

Examined server/start.ts and application.ts, ProjectSession, patch unions/schema, capability checks, reference traversal, planning hash and CLI output mapping. Existing `check-boundaries.mjs` contains `if (!current || !allowed[current]) continue;`; new owners must hard-fail until explicitly assigned. `mutation-capability.ts` checks `capability.kind !== 'skill'`; S1 must deliberately add the spatial kind/field map and explicit experimental activation. Current PatchOperation has no spatial branch. Those are existing constraints, not regressions caused by these documentation edits.

The root dependency map now resolves the core/spatial relationship without a cycle: spatial is pure and depends only on spec. Shared application extraction preserves current loopback/receipt boundaries. New native capabilities remain in a narrow main-process broker. The corrected attachment path is selectionId -> validated main byte read -> sandboxed parser renderer -> sanitized preview/result, with no arbitrary file-reader IPC. Utility process alone never qualifies as a sandbox.

### Engineering2: code quality and bounded interfaces

The plan originally declared lifecycle methods only in prose; DesktopBridge now includes them, plus AttachmentPreview/ConnectionStatus types and cancellation. Files are split by responsibility, with every new owner added to dependency enforcement. The renderer has no provider credentials, shell or generic IPC access. Source operations remain typed and reach finishMutation/AST/receipt logic rather than becoming free-form extension writes.

Devin's six engineering findings were evaluated: bridge lifecycle and parser byte flow were genuine missing contracts; patch schema/capability file coverage was strengthened; unknown-package checking and release retries were already assigned D1/R4 and are not missing implemented features at planning. Seed0/1 aliasing is removed by accepting only integer seeds1..2^32-1. Repeatability for a given seed was not broken by aliasing, so the finding's impact was narrowed; the suggested XOR workaround was rejected because it can create a zero-state PRNG.

### Engineering3: test coverage and failure paths

Frameworks confirmed from package.json: Vitest, Node tooling tests and Playwright. All new test files are planned and none are claimed executed. An external test-plan artifact maps12 entry/data flows across happy, nil/empty, error and cancellation/race cases to exact test families. The root requirement matrix assigns every agreed capability, including newly addedS2a/S2b/R5 and interface supplement ownership.

```text
native setup -> sender/selection/grant tests -> Electron journey/native picker [E2E]
provider auth -> state/PKCE/cancel/cleanup -> live fake-secret canaries [E2E]
answer/files -> bindings/question generations ->12-case counterfactual rubric [EVAL]
typed actions -> schema/capability/references -> atomic source/receipt tests [INTEGRATION]
assets -> recipes/versioning/hash -> import/export security fixtures [INTEGRATION]
motion -> loaded sweeps -> independent trace check [UNIT + VISUAL FIXTURE]
fleet -> reservations/deadlock -> task conservation +50-robot benchmark [INTEGRATION]
compare -> same workload/stale semantics -> fixed baseline and export selection [E2E]
target package -> actual wheel controller -> observed task/pose/contact evidence [GPU]
desktop update -> signed whole bundle -> installed restart and source preservation [NATIVE]
```

Critical planned regressions are source receipt replay, approval invalidation through spatial evidence, old-client refusal/preservation, native auth cancellation, simultaneous edits and signed desktop/standalone CLI update separation. File/source path escaping tests must include symlinks and swapped file identity. Model output quality has numerical rubric/counterfactual requirements plus binary no-fabrication/no-protected-write gates. No line-coverage percentage is inferred from a planning diagram.

### Engineering4: performance, lifecycle and delivery

S2b now benchmarks search/sweep/reservation/worker kernels before full simulator build. S6 measures stated targets rather than claiming them in advance. The main scaling constraints are bounded search expansions, trace volume, parse decoding and provider calls; static assets are instanced, heavy work is off the UI thread, and immutable results are cached by semantic inputs. None of these guarantees acceptable performance until measured.

Opaque provider runtimes are the biggest external security uncertainty; G1 uses exact versions and real boundary canaries. G4 requires a real supported GPU host, G5 signing/notarization authority. These remain pre-acceptance dependencies. Rollback retains the current signed app and original project/source backups; unknown format members remain preserved/inspection-only. R4 performs actual publication verification and exact source reconciliation with idempotent recovery.

### Parallel implementation strategy

| Lane | Modules | Dependencies |
|---|---|---|
| A: desktop/service | desktop,application,web setup | D1 -> D2 -> D3/D4 |
| B: provider evidence | providers,provider tests | D0 then A1/A2; coordinate spec changes with A |
| C: geometry/compiler | spatial,spec/core changes | S1 after shared contract merge; S2/S2b next |
| Integration | agent/web/simulation/export | Checkpoints C1-C4; shared files have one owner |

At most coordinator+two agents. Parallelize independent evidence or pure modules only; merge shared contract changes before consumers. Do not run multiple agents against the same source/lockfile or count partial lanes as full delivery.

### Engineering completion summary

Four primary sections examined, current-code constraints quoted, architecture/dependency/state/data diagrams written, full error registry retained, test artifact produced and external Devin review completed. Six external items resulted in three contract corrections, one seed-policy correction and two clarified already-planned obligations. Focused Devin repair verification found only missing task ownership for desktop parser files; D3 now explicitly owns those files and tests. The primary reviewer checked that final focused correction. No actual adapter/GPU/signing acceptance is claimed.

### External-review evidence and verdict

| Phase | Devin result | Primary disposition |
|---|---|---|
| Product/CEO |6 findings,exit0 | All6 incorporated into tasks/contracts |
| Design | First call empty; retry5 findings,exit0 |5 resolved, with proactive/hash semantics preserved |
| DX |4 findings,exit0 | Lifecycle/interface/contribution/version supplement added |
| Engineering |6 findings,exit0 |4 actual plan changes;2 existing assigned implementation obligations clarified |
| Focused repair |1 file-ownership omission,exit0 | D3desktop parser files assigned and checked |

Devin's underlying model was not independently identified from these CLI outputs; do not label the result as a particular model or dual-model consensus. It is an external CLI review in a fresh context. Logs are retained in the local `agentic-desktop-plan` evidence directory. The current reviewed plan is ready for user approval of implementation choices, with live integration/environment gates still blocking their acceptance claims.

### Current engineering sources

Accessed 2026-09-07: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [utility processes](https://www.electronjs.org/docs/latest/api/utility-process), [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), [Tauri Node sidecar](https://v2.tauri.app/learn/sidecar-nodejs/), [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Grok CLI](https://docs.x.ai/build/cli/reference), [Grok headless/ACP](https://docs.x.ai/build/cli/headless-scripting), [Grok sandbox](https://docs.x.ai/build/features/sandbox), [Isaac6.0release](https://docs.isaacsim.omniverse.nvidia.com/6.0.0/overview/release_notes.html), [controller example](https://docs.isaacsim.omniverse.nvidia.com/6.0.0/robot_simulation/mobile_robot_controllers.html) and [target requirements](https://docs.isaacsim.omniverse.nvidia.com/6.0.0/installation/requirements.html). Installed local CLI help was inspected without reading credentials. The old Codex CLI review request failed version compatibility, and that failure is retained as evidence for G1.

## Cross-phase themes and follow-up

Continuity is the product outcome: source facts must remain linked through edits, experiments and handoff. Bounded authority and predictable cancellation are required for low-friction autonomy. Reuse saves implementation effort only when schema, references, runtime identity and version pinning remain enforced. Each phase exposed necessary tasks inside the agreed scope; no unrelated expansion was added.

Post-iteration work remains in the approved product roadmap: Windows desktop, other robot classes, multi-floor coordination, remote GPU management, more simulator adapters and real execution/evidence workflows. The unrelated gstack/CLI tooling upgrades are follow-up unless required to pass a concrete adapter gate. Current frozen product scope is not silently narrowed to avoid those gates.
