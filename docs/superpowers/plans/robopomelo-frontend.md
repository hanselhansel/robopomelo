# RoboPomelo frontend implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The coordinating plan owns delegation and review limits. Steps use checkbox syntax for tracking.

**Goal:** Deliver all eleven polished local-browser screens with shared deterministic contracts, loss-preserving editing, traceable review and a portable engineering handoff.

**Architecture:** React renders the shared workflow definitions and server-owned ProjectSnapshot. One same-origin client owns transport and CSRF headers, while a serialized draft controller carries sourceRevision/sourceHash into patches. Core and project-fs remain the only authorities for readiness, permissions, revisions and storage.

**Tech stack:** TypeScript, React, Vite, native HTML controls, local CSS and bundled fonts. Vitest/Testing Library for behavior, Playwright and axe for browser coverage. The master dependency task selects and locks package versions before implementation; this plan does not install dependencies or create a competing lockfile.

## Inputs and execution boundaries

Read `AGENTS.md`, `DESIGN.md`, all five companion specifications, and `robopomelo-contracts.md` before code. The parent coordinates the master plan, API and package versions. This is a frontend subplan, not authority to change public schemas or release scope. No code begins before the parent completes autoplan's sequential reviews. Every source file stays under 400 lines.

The visual candidate is Editorial Studio, selected by the agent within the approved direction. The image and comparison board live under `/Users/hansel/.gstack/projects/robopomelo/designs/review-20260905/`. No new mockup is claimed to have been reviewed by Hansel. Implement from DESIGN.md and actual specification fixtures; generated raster text is not authoritative.

The parent owns final whole-branch/release reviews and repair-cycle budget. Focused task tests here establish feature behavior and are not additional whole-branch reviews. No paid/live model calls in tests.

## Contract handshake with server work

Import Deployment, Knowledge, FieldDefinition, ValidationReport, PatchEnvelope and decision types from the shared packages established by the contracts plan. Do not recreate a permissive `Record<string, any>` domain model in the web app.

The shared snapshot is:

```ts
type ProjectSnapshot = {
  deployment: Deployment;
  sourceRevision: string;
  sourceHash: string;
  planningHash: string;
  validation: ValidationReport;
  approvalStatus: ApprovalStatus;
  approvalDetails: ApprovalDetails;
  evidenceObservations: ObservedEvidence[];
};
// ValidationReport.readiness is 'ready' | 'warnings' | 'blocked'.
// Render ValidationReport.label verbatim. Never recalculate readiness in React.
```

Server operations required: session/bootstrap/workflow, create/open/example, snapshot, checked/applicable patch, proposal list/diff/apply, evidence add/reference/list/check/remove, history list/diff/restore, review document/traceability, acknowledge/waive/approve/revoke, export preview/download, trust read/update/revoke, updater status/policy/check/install/rollback. Route spelling is owned by the contracts/server plan. UI adapter functions map these operations to that frozen route table exactly once.

Every mutation includes expected revision/hash where project-bound, CSRF token and operation-specific inputs. A conflict returns current source identity plus the preserved proposed diff. Permission rejection, unsupported version, malformed external YAML, I/O failure and update-integrity failure remain distinct typed outcomes. Evidence sources arrive through explicit user selection or path entry; ordinary endpoints never receive arbitrary filesystem paths.

The browser uses in-memory drafts only. No deployment contents, evidence, review decisions or revisions go to localStorage, IndexedDB or service-worker caches. Browser reload/close while unsaved triggers beforeunload; fail-safe Copy unsaved changes is available. Opening a saved project restores from its folder.

## File map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/main.tsx`, `app.tsx` | Mount and session bootstrap |
| `apps/web/src/styles/{tokens,base,shell,forms,review,print}.css` | Visual system separated by surface |
| `apps/web/src/api/{client,operations,errors}.ts` | Same-origin transport, operation map, typed outcomes |
| `apps/web/src/state/{project,drafts,navigation}.ts` | Snapshot, serial autosave, guarded navigation |
| `apps/web/src/components/{AppShell,ProjectHeader,StatusBadge,Dialog,ErrorSummary}.tsx` | Shared shell and accessible primitives |
| `apps/web/src/fields/{FieldControl,KnowledgeField,ReferenceField,QuantityField,RecordEditor}.tsx` | Shared-workflow rendering |
| `apps/web/src/screens/{Welcome,Planning,Review,Changes,Evidence,History,Settings}.tsx` | Eleven screens through one reusable Planning component |
| `apps/web/src/review/{DocumentView,ValidationInspector,Traceability,DecisionForm,ExportDialog}.tsx` | Review surfaces and explicit actions |
| `apps/web/src/changes/{DiffView,ConflictPanel}.tsx` | Semantic change inspection and recovery |
| `apps/web/test/` | Component and state tests with typed fixtures |
| `tests/browser/` | Real-server browser flows and screenshots |
| `docs/verification/frontend.md` | Actual run evidence and coverage gaps |

No app screen exceeds 400 lines. Split record-specific editor groups under fields when needed; do not duplicate core logic to shorten a file. Skills and terminal wizard continue consuming the same shared field definitions.

## Task 1: Transport and bootstrap

Files: create `apps/web/src/api/client.ts`, `operations.ts`, `errors.ts`, `apps/web/test/client.test.ts`.

- [ ] Write a transport test that receives the session CSRF token, performs an author operation against loopback, and asserts token inclusion. A rejected cross-origin URL must never call fetch. Use a mock fetch that records arguments and returns typed contract envelopes.
- [ ] Run `npm exec vitest run apps/web/test/client.test.ts`; expect failure because the client module is absent.
- [ ] Implement a same-origin client. Build URLs from the fixed route map; `new URL(path, location.origin).origin` must equal location.origin. Set credentials same-origin, JSON content type when needed, and the session CSRF header for mutations. Read typed error envelopes even on non-2xx responses. Abort superseded reads; never abort a mutation then assume it failed.
- [ ] Test 409 conflict, 403 grant rejection, invalid JSON response, disconnected server and aborted read. Mutations return a settled success/error/unknown result so interrupted responses can be reconciled through change ID before retry.
- [ ] Run the focused tests and typecheck. Commit only the four intended files after green with `feat: add local browser transport`.

## Task 2: Design tokens, shell and accessible navigation

Files: create `apps/web/src/styles/tokens.css`, `base.css`, `shell.css`, `main.tsx`, `app.tsx`, shared shell/header/status/dialog/error components, `apps/web/test/shell.test.tsx`.

- [ ] Add shell tests for one h1, skip link, all ten project navigation entries, current section, separate readiness/operator status, source revision and save status. Simulate narrow navigation open/close and verify focus restoration.
- [ ] Run `npm exec vitest run apps/web/test/shell.test.tsx`; expect missing components.
- [ ] Implement DESIGN.md tokens and shell with CSS grid, native landmarks/anchors and buttons. Render core label verbatim, with readiness icon and text. Bundle font assets/licenses through the parent dependency task; do not load a CDN. The app route map contains welcome plus frame/flow/success/requirements/acceptance/review/changes/evidence/history/settings.
- [ ] Implement a reusable modal with explicit accessible title, initial focus, safe Escape behavior and focus restoration. Keep an ErrorSummary with links to affected field IDs.
- [ ] Run focused component tests and `npm run typecheck`. Commit `feat: add accessible project shell` with explicit changed paths.

## Task 3: Welcome, explicit folders and project switching

Files: create `apps/web/src/screens/Welcome.tsx`, `state/project.ts`, `state/navigation.ts`, `apps/web/test/welcome.test.tsx`.

- [ ] Test Create, Open and Explore example using a typed server fixture. Assert the app submits only the entered selected path, never lists the home directory, and displays existing-content/inaccessible-folder errors without clearing the path.
- [ ] Run `npm exec vitest run apps/web/test/welcome.test.tsx`; expect missing screen/handlers.
- [ ] Implement the three-action welcome surface with a title and explicit path/name form. Use native local-file chooser only where the runtime offers one through its bounded selection contract; typed folder paths are the portable baseline. Display that example data is fictional. Open one selected project and reevaluate its trust.
- [ ] Add unsupported-spec and malformed-YAML recovery cards with inspect/last-readable/restore operations from the server. Do not auto-migrate or overwrite external source. Switching projects first waits for pending writes and releases the active project only on success. First-open trust panel shows the exact root, scopes/mode and remembered-grant behavior, with inspection-only continuation. Missing author scope preserves the attempted edit and links to Settings; decision authority remains separate.
- [ ] Test failed switch preserves previous snapshot and pending input. Run focused tests, then commit `feat: add local project onboarding`.

## Task 4: Serialized draft persistence and conflict recovery

Files: create `state/drafts.ts`, `changes/ConflictPanel.tsx`, `apps/web/test/drafts.test.ts`.

- [ ] Write controlled-timer tests: two edits during 500 ms form one pending patch; an edit arriving during an in-flight write is rebased only against the returned successful snapshot; a navigation flush awaits that queue. Save failure leaves input intact.
- [ ] Run `npm exec vitest run apps/web/test/drafts.test.ts`; expect missing controller.
- [ ] Implement the state machine below. A write snapshots the current pending operations and base identity; new keystrokes queue separately. Success installs the server snapshot and sends later operations against its base after checking nonconflict. Avoid retrying unknown outcomes without querying the change ID.

```text
idle -> dirty -> saving -> saved
                    |-> failed (retain pending operations)
                    |-> conflict (retain base/current/proposed values)
failed -> retrying -> saved | failed | conflict
conflict -> explicit resolution -> dirty -> saving
```

- [ ] ConflictPanel shows base/current/proposed values with per-field Use current, Use proposed and Edit manually choices, retaining unaffected queued edits. A remotely deleted record can be accepted as deleted or explicitly recreated under a new ID, with reference changes shown in the preview. Apply resolution uses a fresh checked base-bound patch. Reload current requires explicit confirmation of discarded unsaved values; Copy unsaved changes remains available. There is no blind Force save. Field errors do not steal focus. Navigation failure offers Stay/Retry/Copy.
- [ ] Test external edits, stale restored base, server disconnect after commit, revoked trust before commit and beforeunload when unsaved. Run focused tests; commit `feat: preserve browser edits across save conflicts`.
- [ ] Add revoked-authority recovery: park the entire draft/input buffer and its project/base identity, navigate to Settings without flushing a denied write, repair the grant explicitly, return and perform a conflict-aware save. This exception must not bypass the save/copy/explicit-discard guard when switching projects.

## Task 5: Shared field renderer and five planning screens

Files: create `fields/FieldControl.tsx`, `KnowledgeField.tsx`, `ReferenceField.tsx`, `QuantityField.tsx`, `RecordEditor.tsx`, `screens/Planning.tsx`, `styles/forms.css`, `apps/web/test/planning.test.tsx`.

- [ ] Parameterize a render test over the five shared workflow definitions. Assert every visible input uses its field label, help/error association and typed operation path; challenge answers persist to linked records. A missing numeric field must not display zero.
- [ ] Run `npm exec vitest run apps/web/test/planning.test.tsx`; expect absent renderers.
- [ ] Render supported field kinds with native controls and a typed exhaustive switch; unknown field kinds produce a compatibility message. Knowledge fields preserve Provided/Unknown/Unverified/Not applicable plus Missing, retaining rationale/owner/action according to the shared definition. Send explicit updates by stable ID, never array index.
- [ ] Render Frame with stakeholder/need/problem groups; Flow with current/intended flows, named endpoints, handoffs and exceptions; Success with baseline/target/unit/subject/method/window; Requirements with capability/rationale/links/dependencies; Acceptance with subject/preconditions/procedure/typed criterion/future evidence/assessor/approver. Field definitions own conditions, labels and ordering.
- [ ] Add reference selectors with readable labels, keyboard navigation and selected-record inspection. Removal shows dependent links and waits for an explicit checked multi-record patch. Questions include applicability explanation; answers are retained when conditions hide them.
- [ ] Implement the DESIGN.md collection-to-step map and shared linked record editor for challenges, risks, assumptions and proposed decisions. Review lists all open issues/decisions, including unlinked records, so none become unreachable. Protected acceptance/obligation actions use supplied-decision controls rather than ordinary author mutations.
- [ ] Use searchable 50-row paginated record/reference lists, stable label/ID disambiguation and retained selected IDs. Direct target navigation loads the target page/group first. Test a target outside the current page.
- [ ] Test true/false, zero, decimal strings, empty arrays, unknown baseline, custom unit warning, duplicate display labels, IDs on demand and incomplete draft save. Run focused tests and typecheck; commit `feat: add five-step engineering authoring`.

## Task 6: Document review, findings and traceability

Files: create `screens/Review.tsx`, `review/DocumentView.tsx`, `ValidationInspector.tsx`, `Traceability.tsx`, `styles/review.css`, `apps/web/test/review.test.tsx`.

- [ ] Test a warning-heavy fixture displays the server document, exact readiness label, uncovered needs, open risks/assumptions/owners/actions and findings. Clicking a finding opens the correct step and focuses its field. Core counts are displayed without recomputation.
- [ ] Run `npm exec vitest run apps/web/test/review.test.tsx`; expect missing components.
- [ ] Consume artifact-package structured/sanitized document output. Render reading content as the primary pane and findings as adjacent inspector. Traceability is a secondary view with bounded horizontal scrolling, captions and headers; cells link to named records. Persist no private document in browser storage.
- [ ] Add RP ID/version/details on demand, waived findings retained, current versus historical operator decision distinct, and narrow-screen inspector dialog. Never let YAML/Markdown inject HTML, remote images or JavaScript. Unsupported extensions disclose their unevaluated semantics.
- [ ] Implement finding-destination resolution for empty collections, hidden groups and historical/deleted records. Empty-container findings focus the corresponding Add action, not a nonexistent field. Show approvalDetails reason codes from core; do not infer content/evidence changes from a status string. Keep export/decision actions outside the Findings dialog at intermediate widths.
- [ ] Test 320 px reflow, long IDs/URLs, no script execution and field-focus navigation. Run focused tests; commit `feat: add document review and traceability`.

## Task 7: Warning acknowledgments and operator decisions

Files: create `review/DecisionForm.tsx`, `apps/web/test/decisions.test.tsx`.

- [ ] Test blocked fixture prevents recording an approved decision and shows blockers, while explicitly supplied rejected/changes-requested decisions can still be recorded; warning fixture requires explicit acknowledgments for approval; accepted fixture submits reviewer, recorder, role, date, source, supplied authority/evidence and exact planning context. Missing human decision values stay missing.
- [ ] Run `npm exec vitest run apps/web/test/decisions.test.tsx`; expect missing form.
- [ ] Implement the final checklist only inside the decision flow. Show the exact reviewed revision, required warning acknowledgments and permitted waiver controls from core. Batch acknowledgment remains a deliberate explicit action. Ordinary author permission cannot turn into decision permission; rejected scope leaves entered data intact.
- [ ] Display stale context errors and revalidate before any resubmission. Record revocation as a separate action without deleting history. Label identity as recorded information, without verified-signature styling. No agent-generated consent or default checked acknowledgments.
- [ ] Test changed evidence after form open, revoked grant, nonwaivable finding and current-approval invalidation. Run focused tests; commit `feat: record revision-bound operator decisions`.

## Task 8: Evidence management

Files: create `screens/Evidence.tsx`, `apps/web/test/evidence.test.tsx`.

- [ ] Test explicit supplied file and external reference flows separately. A future evidence requirement without results shows planned/pending rather than missing required attachment. Hash mismatch remains an integrity finding, not an assertion that evidence content is false.
- [ ] Run `npm exec vitest run apps/web/test/evidence.test.tsx`; expect missing screen.
- [ ] Implement All evidence with separate Purpose (planning/acceptance-requirement/decision) and Location (attachment/external/future) filters; file picker; role/description/source/link inputs; streamed upload progress; cancel/retry behavior that reconciles completed copies. Render observed missing/unreadable/hash-changed statuses with authoritative checkedAt. External/future references say Not fetched/Not yet collected and have no invented check timestamp. Link removal previews dependents and preserves history via server operation.
- [ ] Treat external references as inert until explicit user navigation, with no preview fetch. Unsupported attachments download with safe disposition; no embedded active content. Show file-size limits before upload and server-specific rejection afterward without clearing metadata.
- [ ] Test 256 MiB limit response, interrupted upload, duplicate filename, escaping filename rejection and external link not fetched. Run focused tests; commit `feat: add portable evidence management`.

## Task 9: Changes and history

Files: create `screens/Changes.tsx`, `screens/History.tsx`, `changes/DiffView.tsx`, `apps/web/test/changes-history.test.tsx`.

- [ ] Test Pending/Applied separation, agent attribution, field-readable diff, autonomous applied records, review-each-change Apply gate and stale proposal. History restore must show new-revision/approval-reevaluation consequences before submitting.
- [ ] Run `npm exec vitest run apps/web/test/changes-history.test.tsx`; expect missing views.
- [ ] Implement semantic diff rows with before/after text, additions/removals indicated by labels and color. Preserve long values through wrapping or focused expansion. Show proposal validation/scope/base errors without losing its contents. Already-applied idempotency result links to the committed revision.
- [ ] History displays immutable revision/source identities, actor/provenance, diff and selected snapshot. Restore is an explicit checked operation using current base; a stale restore refreshes comparison rather than overwriting. Recovery state links to the last readable source and error line/column.
- [ ] Test keyboard diff navigation, external edit provenance, historical approvals not shown as current, stale restore and restored live-region feedback. Run focused tests; commit `feat: inspect and restore project revisions`.

## Task 10: Export preview and print

Files: create `review/ExportDialog.tsx`, `styles/print.css`, `apps/web/test/export.test.tsx`, `tests/browser/print.spec.ts`.

- [ ] Test default preview lists exact artifact members, evidence is selected explicitly, omitted references remain in manifest, and export works for blocked drafts with findings. Test failure preserves selection and offers Retry.
- [ ] Run `npm exec vitest run apps/web/test/export.test.tsx`; expect missing dialog.
- [ ] Implement a revision-bound preview followed by streamed download. Include source YAML, brief, acceptance plan, report, review.html, handoff and manifest; choices come from server payload. Prevent mutable selection from silently changing an already-approved preview. Completion states name the resulting file and revision.
- [ ] Print artifact-provided content, hide app chrome, move inspector findings into document flow, repeat table headings and retain revision/hash/version/provenance in body text. Do not omit unresolved issues or selected/omitted attachment information.
- [ ] Run Playwright with A4 and Letter PDF generation against long-table/long-description fixtures; render PDFs and inspect every page for clipping and missing content. Run focused tests; commit `feat: export review packages and printable documents`.

## Task 11: Trust and updater settings

Files: create `screens/Settings.tsx`, `apps/web/test/settings.test.tsx`.

- [ ] Test autonomous is recommended, remember/forget trust is machine-local, imported project cannot grant itself access, and forgotten trust leaves project files/history intact. Update settings default auto and offer notify/off/exact pin.
- [ ] Run `npm exec vitest run apps/web/test/settings.test.tsx`; expect missing screen.
- [ ] Display installed/pending runtime, current-session runtime, compatibility, update mode/channel/pin and last outcome. Settings operations use separate authority. Automatic staging never mutates active-session code. Install/rollback shows server eligibility and incompatible project explanation; breaking migrations remain explicit.
- [ ] Offline mode disables network check actions with explanation but leaves project navigation operational. Corrupt download, insufficient space and timeout show previous version preserved only when server confirms it. No success toast based solely on button click.
- [ ] Test two sessions with distinct runtime identity, readonly/ineligible action, unsupported rollback, failed integrity verification and revoked settings authority. Run focused tests; commit `feat: add local trust and update settings`.

## Task 12: Complete process QA and evidence

Files: create `tests/browser/planning.spec.ts`, `review.spec.ts`, `recovery.spec.ts`, `offline.spec.ts`, `accessibility.spec.ts`, `visual.spec.ts`, `docs/verification/frontend.md`.

- [ ] Add a real-server journey: create project, complete all five steps with explicit unknowns, reopen, resolve a finding, inspect traceability, add evidence, record supplied decision, make a material change, verify stale decision, export selected evidence, inspect manifest and YAML. Compare emitted source/hash/readiness with CLI validation for the same revision.
- [ ] Add keyboard-only journey, forced save conflict, server disconnect, malformed external YAML, evidence mismatch, proposal rejection, restore and failed update. Assertions inspect persisted source and export bytes, not only toast/UI state.
- [ ] Run `npm exec playwright test tests/browser` using the built application and real local server. Chromium/Firefox/WebKit automated coverage is recorded by actual engine/version. Run current real Chrome/Edge/Firefox/Safari where the platform permits; report unverified combinations as gaps.
- [ ] Run axe on every screen and modal, then manually complete keyboard and actual screen-reader tasks. At 320 CSS px and 200/400% zoom verify fields, dialogs, focus, error links and document reading. Actual screen-reader execution requires a real accessible session; an accessibility tree alone is not a passing run.
- [ ] Capture the DESIGN.md screenshot inventory and inspect it against candidate A's hierarchy and corrected tokens. Run `design-review` and full `qa` through the parent-designated workflow without duplicating release-owned reviews. Correct within the shared repair-cycle budget.
- [ ] Deny all outbound requests except loopback in offline tests. Validate no remote font/image/analytics fetch; test files with remote image Markdown and scripts. Test source size/expanded fixture performance with stated hardware and recorded timings.
- [ ] Record exact commands, revisions, OS/browser/runtime versions, screenshot/PDF evidence, actual assistive technology and unresolved gaps. Run focused reruns only for changed/failing behavior; commit `test: verify full local browser workflows` after green.

## Self-review and coverage map

All eleven screens map to tasks: Welcome 3; five planning screens 5; Review 6/7/10; Changes 9; Evidence 8; History 9; Settings 11. Autosave/conflicts 4; paths/unsupported source 3; unknown-state and challenge reasoning 5; RP/readiness/traceability 6; decision authority 7; untrusted attachments 8; stale changes/recovery 9; portable handoff/A4/Letter 10; offline/update/revocation 11; accessibility/browser/performance/evidence 12.

The core owns unit rules, approval validity and warning applicability. The server owns filesystem confinement, transactions, CSRF and updater verification. Frontend tests exercise user-visible consequences without replacing those owners' security tests. Native Windows/Linux and actual Safari/screen-reader verification are required release evidence, not claims this planning document makes.

No application code or dependencies are installed by this plan. Execution follows the parent master plan after autoplan, with no new user preference question for routine green choices.

## Final engineering corrections: proposal and outcome state

Draft controller states distinguish Editing, Saving, Proposed, Saved, Conflict and Outcome unknown. A proposal response carries no committed snapshot. Keep committed base revision/hash separate from candidate preview. Build the next proposal from the full cumulative desired draft against that unchanged base; newly proposed records remain add operations with their latest fields. Proposals are immutable; a new proposal can explicitly supersede an earlier proposal with the same base. The UI labels Proposed and links to Changes, never Saved. Applying a proposal returns a real committed snapshot and only then rebases remaining local edits. Superseded proposals remain inspectable but cannot be applied silently.

Navigation preserves proposed draft state. Reopening a stored proposal reconstructs its candidate by core evaluation against its base; a changed base shows conflict instead of guessed rebase. Switching projects warns about unsent buffers and preserves stored proposals. Test create record→edit again→navigate→apply in review mode, supersede, stale base and server restart. Changes displays base/candidate identities distinctly.

For outcome-unknown responses, call the shared receipt lookup with mutation ID and digest. Pending waits with visible status, proposed loads the immutable proposal, committed loads its revision, not-found permits exact-key replay only through ordinary checked apply, and indeterminate directs recovery without blind resubmit. Uploaded evidence uses a precomputed streaming file digest and metadata binding; retain the selected File until the confirmed outcome. Test response loss after commit and reconnect without duplicate records or lost edits.

Advanced record editors expose verification declarations and attributed attestations under their explicit scopes. They never label these as executed acceptance tests or independently verified facts.
