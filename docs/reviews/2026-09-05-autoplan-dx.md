# RoboPomelo developer experience plan review

Date: 2026-09-05. Mode: DX POLISH. Scope: the approved full v1 CLI, local browser, portable specification and Skills. This is a plan review, not installed-product evidence. The independent native reviewer identified six concrete gaps; each is now an implementation requirement. External Codex CLI model probing failed and Claude OAuth expired, so no cross-model consensus is claimed.

## Persona and first-person journey

The initial developer is a solutions engineer at an AMR integrator. They are comfortable with a terminal and YAML but have limited time to debug a new planning tool. Their desired result is a readable specification and engineering handoff they can discuss with a warehouse operator. They may work offline at a customer site. Their success depends on recoverable local files and a clear distinction between a saved draft and an approved specification.

Planning roleplay, not a user interview or measured session:

“I have a warehouse discovery meeting tomorrow. I want something I can run on my laptop and leave behind as files. The README currently tells me implementation is in progress, so I cannot yet install the promised product. Once released, I expect one obvious command, with the supported Node version stated above it. I do not want to create an account just to see an example. I start with a fictional pallet flow because a blank questionnaire gives me little idea of the finished result. I change one need and see its effect on requirements and acceptance tests. An unknown baseline should stay visibly unknown. If I type into a pipe, I expect an answer or an actionable error, never an invisible question. When I export, I need the tool to tell me exactly where the files went. I open the readable review and share the folder with my colleague. Later, if an update causes trouble, rollback should still apply tomorrow. If a migration fails, I need an intact backup and a recovery instruction that does not overwrite my original folder.”

## Current evidence and benchmark patterns

Research was reused from the bounded parent pass, retrieved 2026-09-05. The [Vite getting-started guide](https://vite.dev/guide/) demonstrates an explicit prerequisite followed by one concrete launch path. The [npm trusted-publisher documentation](https://docs.npmjs.com/trusted-publishers/) distinguishes publication setup from package consumption and current staging behavior. The [open Agent Skills specification](https://agentskills.io/specification) provides a portable instruction package contract. None of these sources establishes RoboPomelo's measured onboarding time or compatibility.

| Pattern | Reference lesson | RoboPomelo decision | Measurement |
| --- | --- | --- | --- |
| Local launch | Prerequisite visible before first command | Supported Node/npm, then npx robopomelo | Actual packed and published launch |
| Learn by doing | Concrete output before lengthy reference reading | Fictional inbound-pallet example, one edit, export | Under five minutes with Node installed |
| Publisher versus user | Account setup belongs to maintainers | No npm login in end-user quickstart | Clean machine-config fixture |
| Agent portability | One declared instruction contract | Six Skills use the same CLI and schemas | Contract fixtures plus honest host evidence |

No comparative rank based on unmeasured competitor timings is claimed. The target is competitive in these specific patterns; actual TTHW remains unmeasured until implementation.

## Magical moment

Delivery vehicle: an editable example inside the local browser, followed by a real downloadable review package. A changed need must expose its linked requirement, KPI and acceptance implications through core findings, rather than simply increment a completion percentage. The example is visibly fictional and cannot pass as customer evidence. The terminal golden path produces the same files from the same source. An incomplete project can be exported as a visibly blocked draft.

## Nine-stage journey map

| Stage | User action | Likely friction | Required resolution |
| --- | --- | --- | --- |
| Discover | Read README | Promise mistaken for released command | Keep unreleased status until publication verified |
| Install | Run npx | Node floor or registry failure | Exact supported prerequisite and fix |
| Start | Create/open/example | Choice overload, root authority | Primary example action, precise root/scopes |
| Learn | Edit first need | Blank fields without domain guidance | Curated questions, linked unknowns |
| Integrate | CLI/Skill patches | Schema guessing, prompt hangs | Published input schemas, no-prompt matrix |
| Debug | Inspect findings | Saved draft confused with ready | Separate operation status/readiness and stable RP IDs |
| Test | Validate/export | Output path or evidence unclear | Exact returned path, explicit evidence selection |
| Deliver | Share review folder | Claimed simulation readiness | Handoff assumptions and missing engineering inputs |
| Upgrade | Relaunch/rollback/migrate | Re-upgrade loop or lost source | Persistent hold and tested backup recovery |

## First-time confusion report

This is a planning trace of documented commands, not fabricated execution output. The current README stops before any runnable command because the package is not published. The planned matrix originally omitted `plan`, leaving its full help/TTY behavior outside an every-leaf assertion. Update policy lacked a precise rollback-to-next-launch guarantee. Help and version output could disagree about the launcher and selected cached runtime. The six tasks below address these problems before package verification. No existing product test is described as passing.

## Pass 1: Getting started

The approved one-command launch and example are appropriate for the persona. A Node prerequisite is unavoidable for npx and must be visible before the command, with prerequisite setup timed separately. The missing acceptance path was a literal README transcript against the distributed artifact. The plan now requires that transcript, expected validate exit code, returned output path and opening review.html. No user account, key, Git or model is required.

## Pass 2: API, CLI and Skills

The command family has consistent nouns and explicit operations, stable IDs and one JSON envelope. There is no public TypeScript SDK in v1, so generated internal types must not be marketed as an external compatibility promise. The matrix now includes plan and update configure. Every finite JSON/non-TTY command is noninteractive, with missing authority distinguished from required confirmation. Host Skills get field boundaries, schema locations, compatible specification range and typed output, not a second business-logic engine.

## Pass 3: Errors and debugging

CliError already contains problem, cause and action; implementation must add a safe documentation reference to command/rule help without requiring online access. Error rendering prioritizes the recovery action and exact field/record location, while JSON retains structured details. Exit codes distinguish malformed command input, blocked validation, stale base, scope denial, I/O, compatibility and update failure. A closed stdin must result in bounded completion rather than a prompt. Never log bootstrap/session secrets or raw untrusted terminal control characters.

## Pass 4: Documentation and learning

README gives one golden path, while terminal-guide, CLI reference and export-handoff explain alternatives. Reference tables derive command/schema information from the shared registry to prevent docs drift. Examples must be complete, fictional, portable and actually executable in fresh-directory tests. Documentation search is repository/browser text search with a clear index in v1; a hosted search service would violate the chosen local delivery boundary. Each release carries a changelog and migration/rollback instructions appropriate to the shipped capability.

## Pass 5: Upgrade and migration

Automatic stable compatible updates are already approved, including offline and pin controls. The missing guarantee was durable rollback selection. The plan now separates mode, pin and rollback hold, defines precedence and preserves later user policy edits on resume. It also requires manifest-based backup recovery into a new empty folder and fresh root trust. No silent schema migration, major update or prerelease activation is permitted. The updater's authenticity and distribution tests remain release gates.

## Pass 6: Developer environment

One private npm workspace release train with exact dependency locks keeps contributor setup reproducible. The isolated Node 24.20.0 runtime satisfies the current verifier floor without changing the user's global runtime. Build and tests run offline after dependency acquisition; shipped browser assets are bundled. Native Windows, macOS and Linux have distinct execution jobs. A clean install of the packed package must prove the distribution includes every asset and no unbuilt workspace dependency.

## Pass 7: Community and ecosystem

Hansel is lead maintainer with public issues and pull requests. Contributor documentation supplies triage expectations, DCO/license contribution terms as decided in the governance specification, security reporting and capability change policy. Additional maintainers earn trust; automation does not appoint them. No new chat community or hosted collaboration service is required. Public issues are the initial feedback channel, and user-provided deployments must be redacted before sharing.

## Pass 8: DX measurement

Use three dimensions: time to first useful review export, independent engineer comprehension and reported friction. The example-to-export task targets under five minutes with Node ready. Post-release discovery follows the approved second-engineer rubric and documented thresholds; there is no fabricated customer evidence and no telemetry. CI checks tutorial correctness and error-contract coverage; voluntary observation supplies usability evidence. Keep recorded environment/version and failed attempts alongside successful timings.

## Scorecard and principle coverage

Scores assess plan completeness only.

| Dimension | Initial | Amended |
| --- | ---: | ---: |
| Getting started | 7 | 9 |
| API/CLI/Skills | 8 | 9 |
| Errors | 8 | 9 |
| Documentation | 7 | 9 |
| Upgrade path | 7 | 9 |
| Developer environment | 9 | 9 |
| Community | 8 | 8 |
| DX measurement | 8 | 8 |

Overall 8.75/10. TTHW current: unavailable; target: under five minutes excluding prerequisite installation. Magical moment: designed, not implemented. All six principles have explicit requirements: low initial friction, learning through example, visible uncertainty, defaults with escape controls, commands in context and a useful exported artifact.

## Implementation checklist

- [ ] Execute literal quickstart and time first useful export from installed artifacts.
- [ ] First launch is one command and delivers the fictional example without account setup.
- [ ] Every registered leaf has help, JSON/non-TTY behavior and exact argument/error tests.
- [ ] Every error includes safe problem/cause/action/help location.
- [ ] Docs examples, schema references and changelog ship with implementation.
- [ ] Rollback/pin/offline/version selection and migration recovery survive real process restarts.
- [ ] Six Skills pass static boundaries and orchestration fixtures; report actual host coverage.
- [ ] Native contributor setup and installed smoke matrix pass.
- [ ] Public issues/contribution/security guidance exists and the maintainer channel is accurate.
- [ ] User timing and handoff evidence remains voluntary and local, with no analytics.

## Existing assets and deferred work

Reuse the approved specs, shared types, CLI registry, core validation, example factory and session service. No runnable product implementation exists yet. A public SDK, hosted playground, hosted documentation search and additional agent-host integrations are deferred because they are separate compatibility/service promises. The approved roadmap already records future integration work; no new speculative backlog item is introduced by this review.

## Implementation Tasks

- [ ] **T1 (P1, human: ~4h / CC: ~30min)**: Persist rollback hold and test exit/relaunch/pin/resume policy transitions. Files: runtime policy/rollback/settings and runtime tests. Surfaced by Pass 5.
- [ ] **T2 (P1, human: ~3h / CC: ~25min)**: Make every finite JSON/non-TTY command finish without prompts, preserving explicit authority. Files: CLI input/dispatch/registry and command tests. Surfaced by Pass 2.
- [ ] **T3 (P1, human: ~2h / CC: ~20min)**: Execute the literal quickstart against packed, RC and stable packages, including output readback. Files: README and distribution tests. Surfaced by Pass 1.
- [ ] **T4 (P1, human: ~3h / CC: ~25min)**: Use one side-effect-free version/policy selector for CLI, doctor and startup. Files: runtime selection/policy and tests. Surfaced by Pass 5.
- [ ] **T5 (P1, human: ~3h / CC: ~25min)**: Document and exercise backup recovery to a new folder with hashes and compatible runtime. Files: migration docs/runtime tests. Surfaced by Pass 5.
- [ ] **T6 (P2, human: ~1h / CC: ~10min)**: Generate every-leaf help/schema coverage including plan and update configure. Files: CLI registry/reference/installed tests. Surfaced by Pass 2.

No new tasks from Passes 6, 7 or 8 beyond the existing delivery plan. No unresolved product decisions. Publication authentication and actual platform evidence remain execution dependencies, not a completed release.
