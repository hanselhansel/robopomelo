# Delivery, governance, quality, and roadmap

Part of the [RoboPomelo v1 design](../2026-09-05-robopomelo-design.md). Written-spec review pending.

## Governance and contributions

Hansel is lead maintainer with final authority over merges, releases, specification changes, roadmap and maintainer appointments. Public issues and pull requests are the contribution path. Additional maintainers receive explicit, scoped authority after sustained trusted contributions.

Document bug reports, feature proposals, specification-change proposals and security-report routing. Contributors must explain the problem, intended behavior, validation and compatibility impact. AI-assisted contributions meet the same evidence and review bar. Contributor guidance requires rights to submit the work under the repository's Apache-2.0 terms and excludes confidential customer materials from public fixtures.

Schema/rule changes need a compatibility decision and affected golden fixtures. Broad architecture or public-contract changes need an ADR. Changesets record release intent. A proposed capability does not become enabled merely by being listed in the roadmap.

The maintainer can delegate repository execution to an agent. Hansel has authorized implementation, testing, commits, pushes, PR handling, merging, releases and synchronization after design/written-spec approval and planning. Individual PRs do not require his personal review. Automated checks remain binding.

## Bootstrap sequence

Bootstrap starts only after the written specification is reviewed and an implementation plan exists.

1. Recheck canonical-path contents, GitHub repository name, npm package ownership/availability, authenticated account permissions and existing remote state. Preserve this documentation directory. Do not replace an unexpected existing repository or package.
2. Initialize independent Git history on `chore/bootstrap`. Commit the approved docs, license and minimal repository identity after documentation checks. No source is copied from another physical-AI project.
3. Create the public repository and publish the bootstrap branch. Establish `main` at the same bootstrap commit using branch/ref creation, then set it as default. This creates the initial baseline without making a commit on `main` or force-pushing it.
4. Configure branch rules, contribution files, issue/PR templates, security policy and Actions permissions. Require PRs and actual checks before feature merges. Keep admin protections active where supported.
5. Implement on `feat/`, `fix/` or `chore/` branches. Commit after each meaningful green change. Evolve required checks as implemented capabilities become available; do not advertise nonexistent test suites as passing.
6. Recheck local HEAD, cached remote ref and live remote ref before integration. Resolve conflicts on branches without reset/stash/force or destructive replacement of unrelated work.

A documentation-only root can be committed before package tooling exists. Its applicable checks are documentation/link/inventory checks. Once source exists, the implemented capability checks become required. The full release gate cannot be replaced by this bootstrap gate.

## GitHub settings

- Public repository; `main` as protected default branch.
- Changes through PRs; no direct source commits on main.
- Required checks from the expected Actions source, checked against the current merge base.
- Resolved review conversations, linear history and squash merges.
- Block force pushes and deletion of main. Avoid a standing protection bypass for automation.
- No mandatory second human reviewer initially. Outside contributions receive maintainer/authorized review before merge.
- Actions tokens default to read-only permissions; grant write/OIDC only to the jobs that need them.
- Untrusted fork PRs receive no publish credentials or privileged execution. Never run their code in a privileged `pull_request_target` job.
- Pin third-party Actions to reviewed immutable commits; use dependency-update PRs to change them.
- Publish only from the authorized release workflow after its source-state and release gates pass.

GitHub permits required PRs without a required approving review. This supports the sole-maintainer workflow without removing check gates. See [GitHub's PR-without-review support](https://github.blog/changelog/2021-11-09-require-pull-requests-without-requiring-reviews/) and [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

## CI design

Use uniquely named jobs and one required aggregate that fails when an applicable job fails, is canceled, is unexpectedly skipped or never reports. A path filter cannot silently suppress the aggregate. Documentation-only applicability is explicit and does not count as full product verification.

| Check | Required evidence |
| --- | --- |
| Build/types/lint | Install from lockfile, compile all shipped surfaces, enforce dependency graph and source-file limit |
| Schema/contracts | Valid/invalid fixtures, generated type/schema consistency, supported version and unit registries |
| Core semantics | Every RP rule; missing/unknown/unverified/not-applicable; traceability; conditional applicability; acknowledgment/waiver/approval rules |
| Patches/orchestration | Field scopes, protected fields, atomic multi-record operations, idempotency, stale rejection and six-Skill contract replay |
| Filesystem/security | Traversal, symlink/junction escape, parser limits, Markdown injection, origin/CSRF/Host checks, malformed requests |
| Transactions/recovery | Failures before/after source replacement, interrupted evidence copy, journal completion, stale lock handling, external edits and competing writers |
| Golden exports | Identical explicit inputs produce expected Markdown, HTML, reports, manifest hashes and normalized archive members |
| Browser end-to-end | All five steps, review inspector, matrix, decisions, evidence, changes, history, updates and export |
| Terminal end-to-end | Wizard navigation/save/resume plus equivalent composable-command workflows and JSON/exit-code contracts |
| Platform matrix | macOS/Windows/Linux installation, local launch, critical storage transactions, terminal flow, exports and shutdown |
| Offline | Deny non-loopback network and complete project workflows with cached runtime; assert no updater requests when off/offline |
| Supply chain | Dependency review, secret scan, shipped-file allowlist, license inventory, release provenance/integrity checks |
| Migration | Every shipped migration, backups, unsupported targets, extension/evidence preservation, failure recovery |
| Updates | Stable eligibility, explicit pins, unsupported runtime/spec, corrupt/interrupted downloads, no mid-session replacement and rollback |

Do not call paid/live models in required CI. Skill-format checks and fixture replay are deterministic. Actual agent-host tests are separately recorded with host/version/date, tested operation and result. Format compatibility is not proof that every host works.

Adapter checks are explicitly not applicable in v1 because no adapters ship. They become required with each implemented adapter and its declared target-version matrix.

Triaged applicable high-impact security findings block release. A scanner's absence, crash or unavailable result is not a clean security result. Suppressions require documented evidence and scope.

## Frontend acceptance

Target WCAG 2.2 AA across the product's complete processes. Automated accessibility checks are supplemented by keyboard navigation, focus/error/status inspection and actual assistive-technology testing. Record tested combinations and gaps; do not relabel an accessibility-tree inspection as a screen-reader run. See [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

Cover current stable Chrome, Edge, Firefox and Safari where available on supported operating systems. Record browser/OS/runtime versions for each release. A WebKit automation run is not evidence of a real Safari run.

| Area | Acceptance |
| --- | --- |
| Completion | New project to reviewed/exported handoff works through browser and terminal without losing edits |
| Accessibility | No known unmet applicable A/AA criterion in the evaluated complete workflows; labels, keyboard, focus, status and errors verified |
| Reflow/zoom | Core forms and documents work at narrow widths and enlarged text; wide matrices scroll in bounded containers |
| States | Empty/loading/incomplete/saved/failed/conflicting/restored states have understandable recovery actions |
| Print | A4 and US Letter outputs retain readable tables, source identifiers, warnings, page breaks and approval provenance |
| Visual finish | Consistent typography, spacing, controls and status treatment across all 11 screens; no clipped controls or placeholder copy |
| Performance | Record cold/warm launch, editing, validation and export timings on stated hardware with reference and expanded fixtures; investigate regressions before release |

Actual unverified required coverage remains a release gap. The implementation agent attempts the tests itself and reports tool/platform constraints if encountered; it does not create a standing personal PR-review task for Hansel.

## First release and update channel

The first installable release is `1.0.0-rc.1`, containing the full agreed v1 scope. The reference project and fixtures are clearly fictional. Documentation makes no customer-validation claim.

Ship the browser, CLI, terminal wizard, schemas, capability registry, six Skills, example, handoff outputs, history/recovery, trust/autonomy, updater and complete documentation together. Internal package versions and Skills do not have independent release trains. Changesets drives reviewed release intent; `specVersion` is independent.

Release procedure:

1. Build from the release PR's exact reviewed source and locked dependencies.
2. Test the packed distribution, not only a development checkout. Check included browser assets, schemas, examples, Skills and command executables.
3. Publish the candidate on an explicit prerelease channel. Install that actual distribution on the supported matrix and execute release smoke/acceptance checks.
4. Prepare the stable version metadata on a branch through the same automated PR process. A different npm version is a different package artifact; retest the stable artifact rather than assuming candidate tests cover its changed bytes.
5. Publish and verify the stable artifact through a non-default verification channel before promoting it to the stable/default update channel. Registry, payload, provenance and compatibility checks must pass first.
6. Verify the public version, hashes/provenance, clean-machine installation and updater-visible channel. Publish a release note with concrete contents, limits and migration information.

Use npm trusted publishing with provenance. Configure the exact public repository/workflow and the necessary allowed publishing action. A staged-publishing configuration that requires an interactive release approval cannot be assumed to provide fully unattended direct publication. Verify account/package capabilities before relying on them. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

Do not publish a placeholder package merely to claim a successful product release. Package ownership or authentication that requires the user's action is reported when actually encountered. Do not expose credentials in files, commands, logs or design artifacts.

First-release update tests use declared fixtures to exercise older-version behavior; they are labeled synthetic. Subsequent releases test upgrades from actual supported prior distributions. Stable updates never auto-select a release candidate. Project migrations remain separate explicit operations.

## Completion evidence

For each delivered change, report what changed, why, relevant verification and material limitations. For end-to-end repository completion verify:

- Canonical local working tree is clean and checked out on main.
- Local HEAD, local main and live GitHub main resolve to the same commit.
- Required checks pass for the integrated source, with no unresolved merge or recovery work.
- No unrelated user work was discarded to obtain cleanliness.
- If a release is claimed, the actual registry package and stable update channel pass readback/installation checks.

Perform the live remote comparison after the final push/merge. Cached `origin/main`, a local commit, or a green development build is insufficient evidence of synchronized release state.

## Documentation inventory

Preserve vision, architecture, specification, validation/rule catalogue, Skills architecture, versioning, security boundaries, the free/open-source position, ADRs, contribution guidance and post-v1 roadmap. Include browser/CLI getting-started guides, offline installation, trust/update behavior, example walkthrough, troubleshooting and engineering-handoff instructions.

Public material contains no pricing or paid-offering proposal. The free/open-source position satisfies the initial business-model documentation requirement. Keep future commercial speculation out of v1 documentation.

## Post-release discovery

Full v1 implementation precedes customer discovery. No interviews, customer artifacts or commitments currently validate product fit. Do not turn simulated users, tests or example files into customer evidence.

After release, measure whether practitioners can complete a useful package, identify omissions and give it to a second engineer without reconstructing their reasoning. Record task completion, time, misunderstood fields, missed requirements, uncovered issues and handoff rework. Compare timing only against an observed baseline with a defined task.

Future feature prioritization requires concrete workflow evidence. Repeated friction in the basic workflow takes priority over adding adapters for their own sake. Actual outreach or sharing customer material requires its own appropriate authorization; this roadmap does not send messages or publish private data.

## Future capability gates

All future capabilities begin experimental, are explicitly activated, and receive their own design/compatibility review. Stable promotion requires documented entry/exit evidence. Track metrics without collecting automatic product telemetry; use volunteered, permissioned observations or local test fixtures.

### Git-aware workflows and optional local-agent/MCP access

- Dependencies: stable source/hash/revision contracts, CLI JSON surface and project confinement.
- Entry: at least two concrete workflows demonstrate value from Git-aware review or programmatic read access.
- Deliverable: optional Git revision/diff context and a read-only-first local MCP surface. Keep the model-free browser and ordinary folders fully usable.
- Exit: round-trip/source consistency checks pass; read tools cannot mutate project or settings; disconnecting Git/MCP loses no project data.
- Compatibility: additive optional metadata; version public tool contracts and declare supported spec ranges. Do not require Git or migrate a project merely to read it.
- Security: loopback or explicitly authorized local transport; no implicit network/model access; any future write scope requires a separate design.
- Metrics: zero source drift in round-trip fixtures, complete read-tool field coverage, measured reduction in a named review task.
- Defer/kill: no demonstrated workflow benefit, mandatory hosted storage, hidden writes or erosion of project confinement.

### Layouts and capacity modeling

- Dependencies: explicit units, flow subjects, measurement provenance and extension compatibility.
- Entry: at least two representative projects need geometry/capacity questions the document-only workflow cannot answer; measured inputs are available.
- Deliverable: optional 2D geometry and transparent deterministic capacity calculations with assumptions and uncertainty.
- Exit: coordinate/unit round trips pass; benchmark cases reproduce their stated calculations; missing inputs prevent unsupported conclusions.
- Compatibility: versioned geometry/calculation extensions, followed by explicit schema promotion/migrations if they enter core.
- Security: local file imports only by explicit selection; no facility connections or robot commands.
- Metrics: round-trip error within documented numeric tolerance, calculation agreement on known cases, reduction in named handoff omissions.
- Defer/kill: unavailable inputs, false precision, insufficient repeatability, or users interpreting outputs as guaranteed performance/safety.

### Simulator and interface adapters

- Dependencies: stable handoff contracts; geometry for spatial exports; a declared target platform/version; available assets and permission to redistribute any bundled assets.
- Entry: a demonstrated handoff need and reproducible target environment for each adapter separately.
- Deliverable: Open-RMF, Gazebo, VDA 5050 or LIF, and Isaac Sim adapters as separate capabilities. Distinguish simulation assets, coordination data and interface-contract mappings.
- Exit: generated artifacts import successfully in the declared simulator/coordination target, or pass target protocol-conformance fixtures for interface adapters. Report every unmapped required field.
- Compatibility: adapter version/range matrix, deterministic conversion, stable source/test IDs and loss reports. An adapter update cannot silently change core semantics.
- Security: offline generation and isolated target tests; no commands or automatic reconciliation into physical systems.
- Metrics: complete mapping of declared supported fields, reproducible target tests, fewer manual handoff steps in the named workflow.
- Defer/kill: no concrete user handoff, unavailable licensed assets, untestable target, silent semantic loss or required physical write access.

### Acceptance-test execution and results assessment

- Dependencies: stable test IDs, immutable reviewed thresholds, evidence integrity and revision-bound decision records. This work can proceed independently of simulator adapters.
- Entry: at least two representative manual or simulated test-run records expose a repeatable recording/assessment workflow.
- Deliverable: record runs, conditions, observations, evidence, deviations and assessments. Separate measured observations, deterministic threshold comparison and human acceptance.
- Exit: every result points to the exact executed test/spec revision; recalculation reproduces assessments; changed thresholds never rewrite historical results.
- Compatibility: add versioned run/result entities with explicit migration and old-reader behavior. V1 remains a readable planning source.
- Security: begin with manual records or explicit file imports; no test runner that drives robots, and no fabricated operator decisions.
- Metrics: 100 percent result-to-test-revision linkage in accepted fixtures, reproducible comparisons, complete missing/invalid evidence detection in test cases.
- Defer/kill: no repeatable evidence source, inability to preserve old thresholds or demands to assume commissioning/safety authority.

### Production telemetry and planned-versus-actual evidence

- Dependencies: result/evidence provenance contracts, explicit metric definitions, authorized datasets and stable mappings.
- Entry: representative authorized datasets can be reconciled with planned KPIs without inventing units, windows or identities.
- Deliverable: read-only imports and planned-versus-actual comparisons with coverage, missing data and uncertainty visible.
- Exit: reproducible aggregates on known datasets; unit/time-window/identity mismatches are detected; source data and attribution are retained.
- Compatibility: version import profiles and mappings separately from core intent, with explicit supported ranges and migrations when promoted.
- Security: local imports first. A future connector requires explicit read-only credentials/network design. No physical control or automatic operating-parameter updates.
- Metrics: reproducible comparison values, documented data coverage and error rates, reduced reconciliation effort against an observed baseline.
- Defer/kill: poor or unauthorized data, irreconcilable definitions, misleading comparisons or required physical write permissions.

GitOps, where added, governs deployment intent, evidence and approval history. It does not mean autonomous robot control.
