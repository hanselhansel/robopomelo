# Product and interfaces

Part of the [RoboPomelo v1 design](../2026-09-05-robopomelo-design.md). Implementation authorized by Hansel on 2026-09-05; changes remain subject to the recorded execution/release gates.

## Guided engineering reasoning

The same declarative workflow definitions drive browser forms, terminal questions, validation links, and Skill field mappings. They define step order, labels, help, input types, record references, and conditional questions. They contain no separate readiness engine.

| Step | Required reasoning | Example challenge questions |
| --- | --- | --- |
| Frame | Needs, observed problems, scope, intended outcomes, stakeholders, responsibilities | Who experiences the problem? What observation supports it? Who is missing from the review? What is explicitly outside scope? |
| Material flow | Current/intended flow, load unit, origins/destinations, handoffs, volumes, exceptions, dependencies | What happens if the destination is occupied? Who resolves a damaged load? What is different during peak periods? Where does a task start and finish? |
| Success | KPI baseline, target, units, measurement window/method, source, owner | Does throughput include waiting and charging? What was actually measured? Can baseline and target be compared? What could make the measurement misleading? |
| Requirements | Vendor-neutral capabilities, constraints, assumptions, linked needs/flows/KPIs | Which need does this requirement serve? Is it a capability or a selected product? What input is still unverified? Which dependency might prevent the workflow? |
| Acceptance | Linked requirement/KPI, conditions, procedure, threshold, evidence requirement, assessor/approver | What counts as a pass? What must be observed? How are exceptions exercised? Who interprets the result? Which evidence will only exist after execution? |

Challenge answers create or reference domain records rather than remain disposable form text. Answers may be provided, unknown, unverified, or not applicable with an explanation. A missing answer remains distinguishable. Conditional questions appear only when applicable, and their applicability reason is inspectable.

Needs, problems, challenges, and risks are first-class record types. They can be created in relevant steps and edited wherever linked. Their consolidated view is in the review document; they do not add a twelfth screen.

The application never guesses facts to clear a checklist. A user may explicitly supply hypothetical values in the fictional example or an assumption, with that status preserved in every output.

## First launch and project selection

`npx robopomelo` opens a local welcome screen. The terminal prints the loopback URL and a shutdown instruction. Headless machines can suppress opening a browser and use the terminal interface.

Welcome offers Create a project, Open a project, and Explore an example. A path must be explicitly selected through a native chooser or entered by the user. The UI does not expose unrestricted filesystem browsing through its HTTP API. An example is copied into a user-selected folder and is editable without changing the bundled original.

One project is active per server instance. Switching projects flushes completed writes, preserves pending edits on failure, closes project-specific handles, and reevaluates trust. An existing root is never overwritten by `init`; it must be empty or explicitly contain a compatible initialized project when resuming.

## Browser inventory and interaction contracts

| Screen | Primary actions | Required exceptional states |
| --- | --- | --- |
| Welcome | Create, open, copy example | Missing runtime prerequisite, invalid path, inaccessible folder, existing content, unsupported specification |
| Frame | Define problem, needs, scope and people | Unknown source, incomplete ownership, duplicate records |
| Material flow | Describe and link flows/handoffs/exceptions | Missing endpoint, dangling reference, unknown volume, duplicate IDs |
| Success | Enter measurements and targets | Incompatible units, unsupported measurement, unknown baseline |
| Requirements | Specify capabilities and dependencies | Unlinked requirement, unresolved dependency, unsupported extension semantics |
| Acceptance | Define procedures, thresholds and evidence | Unmeasurable threshold, missing approver, future evidence pending |
| Review & export | Read document, inspect findings, inspect traceability, record decision, choose export | Blocked readiness, unacknowledged warnings, stale approval, export failure |
| Changes | Inspect proposed/applied patches, accept authorized proposals | Stale proposal, rejected scope, invalid structure, already-applied patch |
| Evidence | Attach, reference, inspect, unlink, check hashes | Missing/changed file, untrusted content, external reference, unreadable file |
| History | List, compare, restore as new revision | External edit, incomplete recovery, stale restore base |
| Settings & updates | Trust/autonomy, forget project, update mode/channel/pin/version/rollback | Offline, incompatible update, failed download, failed integrity check, insufficient disk space |

The project header always shows name, readiness, save status, and the viewed revision. Readiness and operator approval have separate labels. Findings link to the affected field or record. Technical IDs and raw YAML are available on demand.

Review uses a readable document with a validation inspector alongside it. At narrow widths, the inspector moves into an accessible panel. The traceability matrix is a secondary view. A checklist appears at the final decision-recording step, not as the primary document.

Autonomous mode displays applied changes and their provenance without requiring approval clicks. Review-each-change mode queues valid proposals until an authorized user applies them. A rejected change includes a useful reason and can be corrected without losing its original diff.

Browser drafts debounce writes by approximately 500 ms after input settles and flush on explicit navigation. The implementation must preserve any unsaved input on failure. Validation must not steal focus. Loading, empty, error, conflict, saved, and restored states receive deliberate copy and accessible announcements.

The app supports same-computer desktop browsers on the supported operating systems. Responsive design supports narrow windows and zoom; it does not create a LAN server or add native iOS/Android operation.

## Visual direction and feedback

Use warm white surfaces, charcoal text, restrained pomelo accents, legible typography, and consistent spacing. Use denser layouts for technical inspection while keeping planning forms approachable. Status meaning never depends on color alone. Bundle all fonts/icons/assets with the application.

Prefer progressive disclosure for identifiers, raw schema fields, and troubleshooting detail. Use direct explanations such as “This target has no measurement window” rather than internal implementation errors. Error details remain available for engineers and CLI users.

Reference-product quality informs hierarchy, feedback, onboarding, responsiveness, and finish. Do not copy another product's design or branding. The initial design review is text-based at Hansel's request.

## Terminal wizard

`plan` starts or resumes the same five steps. It supports back, skip with an explicit knowledge state, inspect findings, save, and exit. It does not require completion in one session. Users can revisit records by readable label or stable ID.

Interactive prompts render through terminal primitives with keyboard access, plain-text fallbacks, and no dependence on color or mouse interaction. Non-TTY calls do not unexpectedly enter a wizard; they return structured guidance to use composable commands or an interactive terminal.

## Public CLI surface

The following syntax is the v1 contract. Detailed help includes examples and input-schema locations. `--help` and `--version` have no network or project-write side effects.

| Command | Contract |
| --- | --- |
| no command / `open [folder]` | Start the browser application; `--no-browser` prints URL only |
| `init <folder>` | Create a blank project; `--example inbound-pallet` copies the bundled example |
| `plan [folder]` | Interactive five-step workflow |
| `show` | Inspect project; `--id <id>` selects a record; `--traceability` selects linked coverage |
| `validate` | Run structural and semantic checks, including observable local evidence integrity |
| `patch check <file>` | Validate envelope, source base, write scope, structure and resulting readiness without applying |
| `patch diff <file>` | Show before/after record and field changes |
| `patch apply <file>` | Apply under current grant or explicit one-run authorization |
| `history list` / `history show <revision>` | Inspect recorded revisions |
| `history restore <revision>` | Restore reviewed authoring state as a new revision; reevaluate approvals |
| `evidence add <file>` | Copy an explicitly supplied local file; `--reference <uri>` records a reference instead |
| `evidence list` / `evidence check` | Inspect references and verify local hashes |
| `evidence remove <id>` | Remove or replace references through a validated change; preserve recovery copies |
| `review acknowledge <file>` | Record structured finding acknowledgments with actor, reason and reviewed content |
| `review waive <file>` | Record a permitted waiver with scope, reason, evidence and authority |
| `review approve <file>` | Record an operator decision against exact reviewed content |
| `review revoke <id>` | Record revocation without erasing the old decision |
| `export` | Write the full handoff ZIP by default; `--format files` writes its members to a directory |
| `trust show` / `trust grant` / `trust revoke` | Inspect or change machine-local project grants |
| `migrate` | Preview an available migration; `--apply` executes an explicitly authorized migration with backup |
| `capabilities` | List capability stage, version/range and explicit activation state |
| `doctor` | Local runtime/project diagnostics; no unsolicited network probing |
| `update check` / `update install` / `update rollback` | Inspect, stage/install or revert supported runtime versions |

Project commands accept `--project <folder>`. Composable commands accept `--json`. Input files accept `-` for stdin where this is unambiguous. A documented `--yes` may suppress a confirmation only when the caller also has or explicitly supplies the required operation scope. It never waives validation or creates operator consent.

Global operating flags include `--offline`, `--runtime-version <exact-version>` and `--update-mode auto|notify|off`. An exact runtime selection disables automatic selection of another version for that invocation; offline selection requires a cached/installed version. `--authorize <scopes>` declares one-run caller authorization for named operation scopes; persistent grants use `trust grant`. These flags do not prove human presence or override protected domain rules.

Machine output uses a versioned envelope containing `command`, `ok`, `data`, `findings`, `errors`, `sourceRevision`, `sourceHash`, `toolVersion`, and `specVersion` where applicable. JSON occupies stdout; diagnostics go to stderr. No ANSI escapes appear in JSON. Mutations return the applied change ID and new revision, or a non-mutating failure.

| Exit code | Meaning |
| --- | --- |
| 0 | Command succeeded; validation may contain warnings |
| 1 | Unexpected internal failure |
| 2 | Invalid arguments or malformed input |
| 3 | Specification blocked, or requested final approval prevented by findings |
| 4 | Stale revision or concurrent-write conflict |
| 5 | Permission absent or operation outside grant |
| 6 | Filesystem/I/O/recovery failure |
| 7 | Unsupported version, capability or migration |
| 8 | Update network/integrity/install failure |

An ordinary draft mutation can succeed with exit 0 while returning `readiness: blocked`. `validate` uses exit 3 for blockers. This separates persistence success from document readiness. Offline launch remains successful when an optional update check cannot run.

## Export and handoff

The ZIP contains the source YAML, deployment brief, acceptance plan, validation report, print-ready `review.html`, engineering handoff, `manifest.json`, and selected attachments. Export is allowed for incomplete projects; every view prominently carries readiness and open findings. Export never records approval by itself.

The browser previews the exact file list before download. CLI selection is explicit and machine-readable. Attached evidence is not included silently just because it exists in the working folder. An omitted attachment remains identified in the manifest as referenced but not bundled. External references are never downloaded.

The engineering handoff contains:

- Intended movement scenarios, load units, handoffs and exception behavior.
- KPI and acceptance-test IDs, conditions, thresholds and required observations.
- Known constraints, assumptions, risks, open questions, owners and next actions.
- An asset-gap checklist for measured geometry, robot models, sensors/controllers, task mappings and engineering configuration.
- A clear statement that the package contains planning intent, not a runnable simulation or verified physical configuration.

No floorplan editor, inferred layout, vendor selection, robot model generation, simulator exporter, or executable robot command is hidden inside the handoff feature.

Artifacts identify their source revision/hash and generation versions. Stable ordering and explicit generation inputs make outputs reproducible. Archive metadata is normalized for golden-output checks. The manifest hashes all payload members; it does not recursively hash itself. Private history, machine trust, update settings and runtime caches are excluded from the review ZIP.

Changing an exported Markdown/HTML view does not edit the source project. A recipient can open the included YAML as a new project, with a new local trust decision. Imported approvals remain asserted records with their provenance and validity reevaluated.

## Agent Skills architecture

Use the open Agent Skills directory/`SKILL.md` specification, with standard frontmatter and namespaced string metadata pointing to a bundled machine-readable contract. The contract declares trigger, required inputs, read/write field paths, dependencies, supported spec and CLI ranges, commands, validation, stop conditions and output shape. Metadata cannot grant application permissions. See the [Agent Skills specification](https://agentskills.io/specification).

| Skill | Responsibility and write boundary |
| --- | --- |
| `frame-robot-deployment` | Frame needs/problems/outcomes/scope and proposed stakeholder responsibilities; create associated questions and assumptions |
| `specify-material-flow` | Current/intended flows, endpoints, handoffs, volume assumptions, exceptions and linked proposed challenges/risks |
| `define-deployment-kpis` | KPI definitions, candidate baselines/targets, units, measurement methods and source links |
| `specify-amr-requirements` | Vendor-neutral requirements, rationale/dependencies and linked proposed risks/mitigations |
| `design-acceptance-plan` | Planned tests, criteria, conditions, evidence requirements and proposed assessment responsibilities |
| `plan-amr-deployment` | Orchestrate the five narrower Skills and report overall progress; no broader write or decision authority |

Frame precedes flow; KPI work reads both. Requirements read framing/flow/KPIs. Acceptance reads requirements/KPIs/flow exceptions. The orchestrator can return to an earlier step when a dependency changes, but must use fresh revisions and the same narrow field contracts. All Skills may propose linked open issues within their declared scope; none may silently accept decisions, attest evidence or waive findings.

Skill execution occurs in the user's chosen agent host. RoboPomelo does not spawn an LLM, run a model, extract notes with AI, or require an API key. Skills first inspect the project/installed capabilities, obtain a current base, propose a structured patch, validate/diff it, apply only within granted scope, and report the resulting revision and outstanding issues.

Stop the dependent action for unavailable facts, incompatible versions, stale bases, missing authority or failed structural checks. Continue independent authorized work where possible. Do not repeat rejected proposals indefinitely or manufacture values to obtain a green readiness result.

The intended ecosystem includes Codex, Claude, Copilot, Grok, Gemini, local models and future compatible hosts. Provide host-specific installation guidance or ordinary-file/CLI instructions as appropriate. A compatibility record distinguishes actual successful host runs, documentation-based setup and unverified paths; native Skill support is never assumed merely from the host's name.
