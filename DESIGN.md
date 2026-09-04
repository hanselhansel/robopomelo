# RoboPomelo design system

Status: implementation design selected by the agent within Hansel's approved calm, document-first direction on 2026-09-05. The selection is not a claim that Hansel reviewed new mockups.

## Product character

A careful engineering workspace with an approachable reading surface. Users should see the purpose of a field, where their answer is used, what is still unknown, and what they can do next. The document is the product's center of gravity. The application must not resemble a robot control console, generic analytics dashboard or chat assistant.

The working persona is an AMR solutions engineer or deployment planner. The reviewing persona is a warehouse operator. Both should read a useful plan without learning schema terminology. Stable IDs, raw YAML and technical findings remain available on demand.

## Chosen direction

Editorial Studio combines a narrow project navigation rail, a spacious central document or planning form, and a contextual inspector. Warm white and charcoal dominate. Deep leaf green identifies primary actions; muted coral supplies a small pomelo brand accent. The reason for selecting it is the direct fit with the approved document-plus-validation review surface and its continuity between form authoring and exported reading.

The alternative concepts are Engineering Notebook (horizontal tabs, cooler palette, denser tables) and Quiet Fieldbook (wide outline, plum/sand palette, inline notes). Candidate images and the selection record are local planning artifacts, not runtime assets. Their raster text is illustrative; this document and the normative specifications govern actual content and behavior.

Artifact directory: `/Users/hansel/.gstack/projects/robopomelo/designs/review-20260905/`.

## Color tokens

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#F7F5F0` | Application background |
| `surface` | `#FFFFFF` | Fields, document, dialogs |
| `surface-subtle` | `#F0F1EA` | Hover, selected section background |
| `text` | `#242923` | Body and headings |
| `text-muted` | `#596256` | Secondary text, field help |
| `border` | `#D8DDD1` | Dividers, passive outlines |
| `control-border` | `#818A7C` | Required visible control edges |
| `action` | `#315345` | Primary button background, links |
| `link-visited` | `#654D6B` | Visited document hyperlinks |
| `action-hover` | `#244236` | Primary hover |
| `action-text` | `#FFFFFF` | Primary button text |
| `pomelo` | `#C77059` | Decorative brand detail only |
| `focus` | `#285F99` | Keyboard outline |
| `warning-text` | `#76501A` | Warning foreground |
| `warning-bg` | `#FFF5D9` | Warning background |
| `error-text` | `#A32C30` | Blocker/error foreground |
| `error-bg` | `#FFF0EF` | Blocker/error background |
| `success-text` | `#315345` | Specification-ready foreground |
| `success-bg` | `#EAF2E9` | Specification-ready background |

Every state has a text label and icon or shape in addition to color. Decorative coral never serves as small body text. Verify contrast on final composited colors, including focus indicators, disabled states where applicable, input outlines and links. Do not claim AA from this palette table alone.

## Typography

Use locally bundled Source Sans 3 for application text, labels and navigation. Use locally bundled Source Serif 4 for large document headings and reading titles. Use the OS monospace stack for IDs and code. Retain font license files in the distribution. System fallbacks are `system-ui, sans-serif` and `Georgia, serif`; font download failure cannot block use.

| Role | Size / line height | Weight |
| --- | --- | --- |
| Page title | 30 / 38 px | 600 serif |
| Document title | 36 / 44 px | 600 serif |
| Section heading | 22 / 30 px | 600 sans |
| Subheading | 17 / 24 px | 600 sans |
| Body and input | 16 / 24 px | 400 sans |
| Label | 14 / 20 px | 600 sans |
| Metadata | 13 / 20 px | 400 sans |
| Code and IDs | 13 / 20 px | 400 monospace |

Cap reading measure at 72 characters. Avoid all-uppercase body labels. Use tabular numerals for numeric columns. At narrow widths, titles reduce to 26 / 34 px without reducing input sizes.

## Spacing and shape

Use the 4 px spacing scale: 4, 8, 12, 16, 24, 32, 48, 64. Fields have 8 px between label and control, 8 px between control and help/error, and 24 px between groups. A section has 32 px top spacing. Adjacent actions have 8 or 12 px gaps.

Control radius is 8 px; restrained panels use 12 px. A small 0 6px 24px shadow belongs only to floating dialogs/menus. Do not frame each document paragraph in a card. Use horizontal rules, typography and white space to express hierarchy.

Inputs and buttons have a 44 px minimum hit area. Inline icon controls keep a 44 px hit area even if their glyph is 18 px. Field width follows content: units are compact, descriptions can span the reading column.

## Application shell

Desktop at 1280 px and above: 216 px left navigation, flexible content with a 760 px preferred reading width, 300 px contextual inspector. Use a 24 px gutter. Maximum shell width is 1680 px; center the content beyond it. The project header spans content and inspector.

Between 960 and 1279 px: retain 200 px navigation; the inspector opens through a visible Findings button as a labeled dialog. Review/export and decision actions stay in the main content toolbar, outside that dialog. Never squeeze fields into an unusable center column.

Below 960 px: navigation becomes an explicit Project sections button and dialog; the current section title remains visible. Use one content column. Below 600 px: 16 px side padding, stacked action rows, full-width inputs. At 320 CSS px, forms and prose have no page-level horizontal overflow. Traceability and diff tables may scroll inside labeled, keyboard-focusable containers.

The header presents project name, the exact core-provided readiness label, independent operator-decision status, source revision, and save state. Readiness does not become a percentage or a safety badge. A smaller visible link opens technical revision/hash details.

Navigation order: Frame, Material flow, Success, Requirements, Acceptance; Review & export; Changes, Evidence, History; Settings & updates. Welcome is reached through Switch project. Switching or navigating waits for the current save; failures preserve edits and offer Retry, Stay here or Copy unsaved changes.

## Eleven screens

| Screen | Primary layout and action | Context and edge states |
| --- | --- | --- |
| Welcome | Spacious title and three clear actions: Create, Open, Explore example | Explicit path form; no disk explorer. Empty initial state; inaccessible path, existing contents, incompatible spec and recovery state have inline explanations. |
| Frame | Outcome and scope first, then stakeholder/need/problem records | Add records inline. Link source and affected stakeholder. Duplicate names are allowed when IDs differ; duplicate IDs are server errors. Unknown provenance remains visible. |
| Material flow | Current/intended sections; named origin, destination, load, steps and handoffs | Text step list, not a floorplan. Exceptions and peak questions appear beside relevant flow. Missing endpoint and broken reference link to fields. |
| Success | KPI list and focused measurement editor | Value, unit, counted subject, method and window are grouped. Unknown baseline is an explicit state. Never show unknown as zero. Unit incompatibility shows both affected values. |
| Requirements | Requirements grouped by affected flow/need, with link selectors | Capability statement and rationale are primary. Assumptions/dependencies remain visible. Untested extension semantics use a disclosure, not a false validation badge. |
| Acceptance | Test cards expand into preconditions, procedure and typed criterion | Evidence requirements labeled Future acceptance evidence. No Run test button or fabricated pass/fail. Missing method, threshold or approver links to its input. |
| Review & export | Readable document plus validation inspector; Download handoff package is primary | Traceability is a secondary tab. Operator decision opens a checklist/dialog. Blocked exports remain allowed with visible findings. Export preview lists every selected file. |
| Changes | Pending and Applied tabs; semantic diff with readable field labels | Autonomous changes appear under Applied. Review mode shows authorized Apply action. Stale/scope/structure failures retain the proposal and original base. |
| Evidence | All evidence view with separate Purpose and Location filters; Add evidence | Purpose includes Planning, Acceptance requirement and Decision. Location includes Attachment, External and Future. Missing/hash-changed/unreadable state includes authoritative check time. Unsupported attachments download. |
| History | Revision list alongside selected diff and provenance | Restore preview explains new revision and approval reevaluation. Stale base preserves preview; external malformed YAML offers last-readable inspection. |
| Settings & updates | Project trust and application runtime are separate sections | Autonomous/review mode, explicit scopes, Forget project, update auto/notify/off, pin, installed/pending version, compatibility, rollback. Offline/failure does not obscure project navigation. |

## Shared field design

Knowledge state is a labeled native select: Provided, Unknown, Unverified, Not applicable. An unfilled field is Missing; it is not a selected invented answer. Reveal value controls for Provided/Unverified, rationale for Not applicable, owner/next action for unresolved values where applicable. Explicit state changes show any value being replaced before submission.

Link selectors display human labels plus ID on demand. A selected reference shows its target and a View link. Avoid arbitrary free-text IDs as the only authoring method. Removing a referenced record surfaces dependents and requires the explicit replacement/removal patch; never auto-delete dependents.

Engineering questions are concise, collapsible field groups beside the relevant records. Their answers create linked records. Show why conditional questions apply and preserve previous answers when hidden by applicability. They are thinking aids, not a disposable checklist.

## Interaction and copy

Save states: Editing, Saving, Saved, Save failed, Changes conflict. Use a polite live region for settled state changes, not every keystroke. Debounce approximately 500 ms and flush before navigation. Show an alert once for failed/conflicting writes; do not steal focus when validation updates.

Empty lists say what can be added and why. Buttons use actions such as Add requirement, Check evidence, Compare revision. A dialog explains the concrete effect before a consequential action. Error summaries link to fields and preserve all input. Technical errors are available under Details with a copy action; raw stack traces are not primary copy.

Use 120-160 ms opacity/color transitions. Disable nonessential motion under prefers-reduced-motion. No page entrance animations, skeleton shimmer, celebratory confetti or animated readiness meters. Loading text is specific: Opening project, Checking files, Preparing package.

Unknowns are useful planning information. Avoid congratulatory completion language. Separate "Specification ready for review" from "Operator decision recorded". An existing approval that is stale says "Earlier decision needs review" and shows the reason received from core.

Use the actual project/document title rather than the illustrative mockup headline “A clear plan for the next stage.” The pristine blank project shows its exact blocked readiness with a quiet “Early draft” explanation and the next useful authoring action; do not show every untouched field as a red error at first launch. Findings remain available in the inspector.

## Record homes, trust and conflict choices

Frame owns needs, problems and stakeholders. Material flow owns workflows and linked challenges/risks/assumptions. Success owns KPIs and their measurement assumptions. Requirements owns requirements and proposed design decisions, with linked issues. Acceptance owns tests and future evidence requirements. Every linked issue opens the shared record editor from its link. Review's open-issues/decisions sections list all such records, including unlinked ones, with type filters and Edit actions. No additional top-level screen is added.

Accepted decisions and protected review-obligation changes use an explicit supplied-decision action within the current editor. Show missing authority beside that action with a route to Settings; never promote an ordinary author grant silently. Creating or editing ordinary proposed reasoning remains fluid.

First open of an untrusted project shows a bounded trust panel with the exact selected folder, current grants, autonomous/review mode and a remember-until-forgotten explanation. The user can continue with inspection only or authorize the displayed editing scopes. An attempted edit with missing scope remains in the draft and routes to the appropriate settings action. Operator-decision authority is shown separately from authoring.

Permission-recovery navigation is an explicit exception to flush-before-navigation: park all unsaved input buffers in memory, including partial composite fields, with project/base identities and a visible unsaved marker, then open Settings without attempting the denied save. After the grant changes, return to the editor and recheck the source base before saving. Switching projects still requires save/copy/explicit discard; parking a draft does not silently discard it or grant access.

Conflict resolution displays each conflicting field's base/current/proposed values and offers Use current, Use proposed or Edit manually. Unaffected queued edits are retained. For a remotely deleted record, offer Accept deletion or Recreate as a new record; any reference remapping is explicit in the checked preview. Apply resolution submits a fresh base-bound patch only after the resulting diff/validation is shown. Reload current must explain any discarded unsaved values and require an explicit discard action; Copy unsaved changes remains available.

Use searchable paginated lists with 50 rows per page for records, findings, history and reference pickers. Show total matches, keep selected IDs across pages and disambiguate duplicate labels with ID/role. Sort by normalized title then ID for display, or revision order for history. Direct navigation locates the target page before revealing/focusing the control. Traceability uses one row per need and scrolls wide columns inside a labeled container. Use virtualization only as a later measured optimization, not a separate initial interaction model.

Finding navigation resolves section, collection, record and field. Reveal collapsed/conditional groups before focus. For an empty collection, focus its named Add action with the finding beside the empty state. A historical/deleted target opens contextual inspection rather than focusing a nonexistent input. Ordinary section navigation focuses the section heading; finding navigation focuses the actual destination control.

## Keyboard and assistive technology

Use semantic landmarks, one page h1, ordered heading levels and a Skip to content link. Native buttons, anchors, inputs, selects and dialog elements come first. Every field has a visible label; help and errors are linked through aria-describedby. Validation errors add aria-invalid.

Opening a dialog focuses its heading or first meaningful field. Tab remains inside a modal, Escape closes when safe, and closing restores the invoking control. Unsaved dialog inputs survive a recoverable error. Tabs use arrow-key navigation if implemented as an ARIA tablist; ordinary section navigation remains anchors.

Focus ring: 2 px solid focus token with a 3 px offset, never clipped or hidden under sticky headers. Findings use stable links to record and field; focusing a finding destination scrolls it into view and focuses the actual control. Do not rely on hover, drag-and-drop or color for any operation.

Announce save failure, evidence check completion, restored revision and export completion. Do not repeatedly announce the entire validation list. Record actual screen-reader runs separately from automated accessibility-tree checks.

## Review and print

The same artifacts package supplies the canonical document content for browser review and review.html. Use sanitized structured rendering or server-rendered sanitized HTML; no arbitrary innerHTML from YAML/Markdown. Inline external images, fonts and previews are prohibited.

Print hides application navigation, buttons and sticky panels; moves validation, unresolved issues, acknowledgments and decision provenance into printable sections. Keep table headers on following pages and avoid splitting short rows. Long cells wrap; long URLs break safely. Headings stay with the next paragraph. Source revision/hash and generation versions are in the document body so browser header/footer settings cannot remove them.

Use 16-18 mm print margins; test both A4 and Letter at 100% scale. Color-free prints must preserve every status label. Review does not truncate long descriptions or silently omit unknowns. The attachment manifest identifies excluded files as referenced but not bundled.

## QA and release evidence

Run all eleven screens against empty, fictional reference, warning-heavy, malformed/recovery and expanded fixtures. Check long project names, multiline content, duplicate display names, 10,000-record pagination/virtualization behavior where needed, and slow/failing local operations.

Automate complete browser flows, keyboard tasks, accessible-name assertions, axe checks, no remote requests and screenshots at 1440, 1024, 768 and 320 CSS px. Perform actual current Chrome, Edge, Firefox and Safari interaction where available, plus actual screen-reader runs. Playwright WebKit is not Safari evidence.

Required screenshots: Welcome; each of five steps; Review with inspector; traceability; decision dialog; Changes diff; Evidence mismatch; History restore; Settings offline/update failure; save conflict; A4 and Letter print pages. Visual inspection judges clipping, hierarchy and readability rather than relying only on pixel diffs.

No known unmet applicable A/AA requirement in evaluated complete workflows may be relabeled a passing release. Parent workflow owns the final release gate and reports unverified OS/browser/assistive-technology coverage honestly.
