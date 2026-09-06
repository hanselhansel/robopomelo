# Agentic desktop sequential review record

Date2026-09-07. Target: [root plan](../2026-09-07-agentic-desktop.md) and its four linked implementation/contract files. Approved [product design](../../specs/2026-09-07-agentic-desktop-design.md) is the scope boundary. This record describes planning evidence, not passed implementation tests.

## Review setup and provenance

Deep tier because this changes native privileges, model/network access, project authoring, simulator semantics and distribution. Use autoplan's CEO -> Design -> DX -> Engineering order. Existing visual ideation already produced three options and the approved combined mockup; do not regenerate alternatives during review.

Independent bounded research inspected Codex0.145.0/Grok1.0.13 local help and current first-party protocol docs, and current spatial/source/export code. Research is not an independent security certification. Claude CLI reports loggedIn:false, so a Claude outside voice is unavailable; no login prompt or fabricated dual-model consensus. Codex CLI outside voices, if successful, are independent context using the same model family, not cross-model agreement. General tooling upgrade availability is outside this plan's blast radius and is deferred.

Restore point: the initial root plan is retained outside the repo at `~/.gstack/projects/robopomelo/agentic-desktop-plan/autoplan-restore.md`. Released main was compared to live GitHub and matched cafb740. Planning is on a clean dedicated documentation branch at creation.

## Phase1: product/CEO review

Mode: selective expansion under the approved scope. Accept no unrelated feature expansions. Existing boundary/recovery behavior is an asset, not boilerplate to replace.

### Premises and alternatives

The user's observed path/permission friction is direct product feedback; wider practitioner demand is still unvalidated. An agentic desktop may improve that experience, but simulator breadth can obscure the central requirements-to-handoff goal. Preserve the bridge outcome in the benchmark rather than equating a rendered50robot scene with product-market fit.

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

Likely expensive paths are PDF/mesh ingestion, pose-aware path search and repeated provider requests. Limits precede decoding/dispatch, workers cap concurrency, geometry instances share meshes and result reuse uses semantic hashes. Explicit M4/24GiB performance targets replace unmeasured claims.500robots or100x input is unsupported, not silently accepted until memory exhaustion.

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
| D6 | Product | Two-Jetbot Isaac execution fixture, separate50robot local workload | Taste | Proves real controller handoff with a bounded initial target |
| D7 | Product | Explicit GPU/signing gates | Mechanical | External resources have not been established |

## Phase1 external review amendment

Hansel authorized Devin CLI as the external reviewer after the original CLI availability failures. Devin completed a read-only independent CEO review (exit0) with six findings. All were verified against the plan and incorporated: RequirementBinding; full asset drafting/composition/promotion; scored adaptive-question evaluation; R5continuation/competitive benchmark; earlyS2bfeasibility; integrated checkpoints. Source log retained outside repo at `~/.gstack/projects/robopomelo/agentic-desktop-plan/ceo-devin.log`. These are primary-plus-Devin reviewed amendments, not Claude/Codex dual-model consensus. None reduce user scope.

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

In the first5seconds, the user sees the description/file action. Within5minutes, a useful draft should be visible, with waiting on provider authentication or unsupported files explained. Returning weeks later must restore intent, sources and the last valid result, not require a fresh transcript prompt. The implementation plan adds a measured time-to-first-useful-draft benchmark; speed does not permit guessed measurements to appear confirmed.

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

Design phase complete: all7dimensions examined, state/journey maps written, approved mockup retained. Scores reflect plan readiness, not executed frontend quality. No dual-model agreement claimed.

## Phase2.5: developer-experience review

Pending sequential review after Phase2.

## Phase3: engineering review

Pending sequential review after Phase2.5.
