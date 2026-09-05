# Autoplan phase 2: design review

Date: 2026-09-05. Branch: feat/v1. Scope: application UI, all eleven screens. Status: plan-level design review complete; runtime visual/accessibility checks remain required.

## Context and visual evidence

The approved direction is calm and document-first. DESIGN.md, the frontend/runtime/contracts plans and the product specification were read. No previous application components exist. The reusable assets are the chosen tokens, shared workflow/record definitions and the generated visual references, not an existing component library.

Three images were generated during the required design-shotgun work and inspected directly by both the design worker and coordinating agent. Candidate A, Editorial Studio, best fits the readable-document-plus-inspector surface. B overemphasizes dense parallel tables; C adds a second outline and repeated callouts that compete with reading. The written tokens and domain contracts override illustrative raster text, dates, gradients and warning colors.

The user declined a visual companion and authorized routine design choices within the agreed direction. No new board-choice request or claimed human mockup approval is made. The automated image checker returned credit exhaustion and was not counted as a pass. Further image generation is unnecessary for these interaction clarifications; actual app screenshots will be checked after implementation.

Selected reference: `/Users/hansel/.gstack/projects/robopomelo/designs/review-20260905/variant-A.png`. The adjacent approved.json explicitly records agent selection and no human mockup review.

## Step 0: scope assessment

Initial design completeness: 7.9/10. The main hierarchy, visual system, responsive widths and broad error states existed, but several consequential interactions required an implementer to invent behavior. A complete plan needs explicit conflict choices, a home for every record, empty-collection finding navigation and a route out of missing permissions.

The review covered all seven dimensions. External Claude/Codex CLI voices remain unavailable from their earlier authenticated probes, with no fictional consensus. A fresh native Codex reviewer independently identified three high and four medium design gaps. Focused confirmation found those seven addressed and one further permission-recovery deadlock, which was then explicitly resolved.

## Pass 1: information architecture, 8 to 9.5

```text
Welcome -> selected project + trust choice
  Frame / Flow / Success / Requirements / Acceptance
  Review document [open issues + decisions + validation] -> export / supplied decision
  Changes / Evidence / History / Settings

Any linked record -> shared editor in its existing screen
Unlinked issue/decision -> Review register -> shared editor
Finding -> reveal target -> field, Add action, or historical inspection
```

The document remains the primary anchor, followed by relevant findings and explicit actions. All record collections now have a named home: Frame for needs/problems/people; Flow for workflows and operational issues; Success for KPIs and measurement assumptions; Requirements for capabilities and proposed decisions; Acceptance for tests/future evidence. Review exposes all issues and decisions, including unlinked records, without adding a twelfth screen.

Finding navigation now resolves collection-level errors as well as existing fields. It reveals hidden groups and off-page records before focus; a missing collection targets its Add action. A deleted/historical reference opens context instead of failing silently.

## Pass 2: interaction states, 7 to 9

| Surface | Loading | Empty | Error | Success | Partial |
| --- | --- | --- | --- | --- | --- |
| Welcome | Opening selected folder | Three explicit actions | Preserve entered path and show remedy | Project/trust context loaded | Unsupported/malformed source inspection |
| Frame | Loading current records | Define problem/outcome, add need/person | Field-linked explanation | Saved assertion and links | Early draft with explicit missing facts |
| Flow | Loading selected flow | Add intended flow | Missing endpoint/reference shown | Ordered flow saved | Unknown volume or exception retained |
| Success | Loading KPI | Add measurable target | Unit/subject/method problem | Saved KPI with state | Unverified baseline retained |
| Requirements | Loading linked requirements | Add capability | Coverage/dependency explanation | Requirement linked | Proposed decision/open constraint visible |
| Acceptance | Loading plan | Add acceptance test | Missing criterion/evidence/approver | Test plan saved | Future evidence explicitly pending |
| Review/export | Preparing frozen view/package | Explain missing package content | Readiness or export failure with actions | Downloaded revision identified | Blocked draft export visibly labeled |
| Changes | Checking proposal | No pending/applied changes | Scope/base/structure retained | Applied revision linked | Conflict choices and checked resolution |
| Evidence | Checking/copying selected file | Add attachment/reference/requirement | Missing/mismatch/unreadable status | File hash observation recorded | Omitted/external/future distinct |
| History | Loading selected revision | Initial revision shown | Missing evidence or protected restore diff | New restored revision | Inspection/recovery without overwrite |
| Settings | Reading local configuration | New trust/update choice | Exact authorization/update problem | Grant/policy confirmed by server | Offline or pending verified update |

Conflict resolution now has per-field current/proposed/manual choices, explicit recreation of a deleted record and a checked Apply resolution. Unaffected queued edits remain intact. Reload requires explicit discard of unsaved values; copying a draft remains available.

Permission repair can park the entire in-memory draft and navigate to Settings without trying the denied save. It retains project/base identity and unsaved status, returns to the editor after authorization and rechecks the source base. Switching projects cannot use this exception to silently lose data.

## Pass 3: user journey, 8 to 9

| Moment | User action | Likely concern | Design response |
| --- | --- | --- | --- |
| First five seconds | Launch/open/example | What does this tool do? | Named engineering task and three clear actions |
| First five minutes | Inspect example or enter first need | Am I doing this correctly? | Explicit knowledge states, challenge context and useful next action |
| Incomplete work | Leave an unknown baseline | Am I forced to invent a value? | Unknown remains useful, visible planning information |
| Review | Follow a finding | Where do I fix it? | Reveal and focus field or Add action |
| Conflict | Encounter another writer | Will I lose my work? | Preserve all input, show competing values and explicit resolution |
| Permission repair | Save is denied | How can I reach the remedy? | Parked draft plus Settings recovery route |
| Handoff | Download package | What will the recipient actually get? | Exact file/evidence preview and revision-bound output |
| Return later | Open old project | What changed and is its decision still current? | History, version, provenance and core-owned invalidation reasons |

The product should encourage thoughtful uncertainty rather than reward empty completion. A new project displays its exact blocked readiness with an Early draft explanation and a clear next action, not a flood of red errors on untouched fields. The long-term trust loop is recoverability and legible decision history, not a percentage meter.

## Pass 4: generic design risk, 8 to 9.5

Classification is application UI. There is no marketing hero, feature mosaic, carousel, decorative gradient or fabricated dashboard metric. Cards are limited to real editable records; paragraphs in the review document are not placed in decorative boxes.

Candidate A's generic “A clear plan for the next stage” headline is replaced by the actual project/document title. The core-generated content supplies real section names and open questions. Coral remains a restrained brand detail; warning text uses the tested higher-contrast token rather than the raster's low-contrast styling.

## Pass 5: design system, 9 to 9.5

The plan specifies Source Sans 3 and Source Serif 4 bundled locally, named colors, a four-pixel spacing scale, reading measure, field spacing, control dimensions and minimal shadows. It defines light surfaces and quiet primary actions consistently across authoring and review. No additional design consultation is needed to choose a new direction.

Add a visited-link token for ordinary document hyperlinks and preserve visible labels after fields contain values. Metadata/labels may be smaller than body text, but explanatory body text remains 16 px. Validate actual composited contrast after implementation rather than treating token calculations as full accessibility certification.

## Pass 6: responsive and accessibility, 8 to 9

Desktop uses navigation, reading workspace and inspector. At 960-1279 px the inspector has one defined behavior: a Findings dialog, with export/decision actions still in the main toolbar. Below 960 px navigation becomes a labeled section chooser; narrow forms remain one column and wide matrices scroll inside labeled containers.

Route navigation focuses a heading, while finding navigation focuses the resolved control or Add action. Dialogs restore focus, actions do not require hover/drag, and save updates use restrained live announcements. Searchable 50-row pagination provides predictable large-project selection and off-page focus behavior instead of leaving virtualized-list semantics unspecified.

The real native/browser/VoiceOver matrix is owned by the delivery plan. Planned keyboard/axe assertions are not actual screen-reader evidence. The app remains same-computer; responsive widths do not imply mobile/LAN hosting.

## Pass 7: resolved decisions

| Decision | Resolution | Owner |
| --- | --- | --- |
| How to resolve a conflict | Current/proposed/manual choices and checked apply | Draft controller + conflict view |
| How to find all reasoning records | Explicit step homes and Review register for unlinked records | Shared record editor |
| Where an empty finding goes | Named Add action and adjacent empty-state finding | Navigation resolver |
| How evidence is grouped | Separate Purpose and Location filters, including decision evidence | Evidence screen |
| What first trust looks like | Exact folder/scopes/mode, remember behavior, inspect-only path | Welcome/Settings |
| Where status explanations originate | Core ApprovalDetails and runtime checkedAt observations | Core/runtime DTO |
| How large lists work | Search, 50-row pages, stable selection and direct target reveal | Shared list/picker |
| How denied save reaches Settings | Park unsaved buffers without flush; recheck base on return | Navigation/draft controller |

All are implementation choices within the approved scope. None requires a new screen, model, hosted service or weaker authority boundary. No design debt is intentionally deferred; remaining uncertainty concerns actual rendering/testing rather than an unspecified interaction decision.

## Litmus scorecard and completion

| Check | Primary inspection | Independent native review | CLI voices |
| --- | --- | --- | --- |
| Brand clear | Yes | Pass | Unavailable |
| Strong anchor | Document | Pass | Unavailable |
| Headline scan | Actual titles required | Prior qualification resolved | Unavailable |
| One job per section | Yes; narrow actions separated | Prior qualification resolved | Unavailable |
| Cards necessary | Editable records only | Pass | Unavailable |
| Motion useful | Brief state feedback, reduced-motion support | Pass | Unavailable |
| Quality without shadows | Typography/spacing carry hierarchy | Pass | Unavailable |

No hard-rejection pattern remains in the written direction. Overall plan design completeness is 9.2/10 after fixes, with actual render comfort and accessibility to be verified in code. Three mockups were generated, one agent-selected within the approved direction, zero new human mockup approvals claimed. Eight interaction decisions were resolved; no additional product scope was added.

NOT in scope: native mobile/LAN operation, chat UI, simulation viewer, paid/account onboarding or a new record-dashboard screen. What exists: DESIGN.md, three visual references and shared workflow/contracts. Required runtime follow-up: design-review and full web QA after implementation, using actual source state and the user's bounded repair budget.

## Implementation Tasks

- [ ] **T1 (P1, human: ~2-4h / CC: ~20-40min)**: Preserve current proposed and manual conflict resolutions. Files: `apps/web/src/changes`. Verify the corresponding frontend component and browser flow.
- [ ] **T2 (P1, human: ~2-4h / CC: ~20-40min)**: Provide authoring homes for all record types. Files: `apps/web/src/fields`. Verify the corresponding frontend component and browser flow.
- [ ] **T3 (P1, human: ~2-4h / CC: ~20-40min)**: Resolve empty hidden and historical targets. Files: `apps/web/src/review`. Verify the corresponding frontend component and browser flow.
- [ ] **T4 (P1, human: ~2-4h / CC: ~20-40min)**: Separate purpose and location filters. Files: `apps/web/src/screens/Evidence.tsx`. Verify the corresponding frontend component and browser flow.
- [ ] **T5 (P1, human: ~2-4h / CC: ~20-40min)**: Show precise first-open root and scopes. Files: `apps/web/src/screens/Welcome.tsx`. Verify the corresponding frontend component and browser flow.
- [ ] **T6 (P1, human: ~2-4h / CC: ~20-40min)**: Display core approval reasons and actual observation timestamps. Files: `packages/core/src/review-validity.ts`. Verify the corresponding frontend component and browser flow.
- [ ] **T7 (P1, human: ~2-4h / CC: ~20-40min)**: Preserve focus with searchable pagination and permission-repair navigation. Files: `apps/web/src/state`. Verify the corresponding frontend component and browser flow.
