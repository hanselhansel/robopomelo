<!-- /autoplan restore point: /Users/hansel/.gstack/projects/robopomelo/feat-v1-autoplan-restore-20260904-203008.md -->
# RoboPomelo v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Respect the three-concurrent-agent limit.

**Goal:** Deliver the full approved RoboPomelo v1, verify its distributed release, and reconcile canonical local main with live GitHub main.

**Architecture:** One deterministic domain core and portable folder transaction layer support browser, CLI, terminal wizard and Skills. The updater is a bounded machine-local subsystem; operator decisions remain separate from authoring grants.

**Tech Stack:** TypeScript; Node 24 with Node 22 compatibility; npm workspaces; React and Vite browser assets; JSON Schema 2020-12, a data-only YAML document parser, deterministic rendering, Node filesystem/HTTP adapters, Vitest and Playwright. Exact locked dependencies follow the current-practice and package inspection recorded below.

## Routing and authorization

Deep tier because this is a new architecture with a public contract, filesystem/access boundary, automatic updater and coupled interfaces. Hansel's 2026-09-05 instruction to implement end to end authorizes proceeding from written-spec delivery. Settled product choices stand. Routine plan/review/merge proceed gates are authorized; the user's strict material stop conditions remain binding.

Research budget: at most ten decision-relevant queries before reassessment. Initial pass used three queries and four primary pages; four follow-up queries resolved filesystem, package-verification and native-runner questions (seven queries total). Sources retrieved 2026-09-05:

- [Node release schedule](https://nodejs.org/en/about/previous-releases): Node 24 and 22 are supported LTS lines; Node 20 is EOL. Use Node 24 for development and a 22/24 runtime matrix.
- [Vite guide](https://vite.dev/guide/): bundled production assets; supported Node minimums fit the chosen runtime matrix. Use no runtime CDN.
- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/): direct publishing must be explicitly allowed for new trusted-publisher configurations after 2026-09-03; OIDC publish requires supported npm/Node versions.
- [npm trust CLI](https://docs.npmjs.com/cli/v11/commands/npm-trust/): account authentication/2FA is separate from CI publication. Resolve actual account capabilities before claiming publication.
- [Node filesystem](https://nodejs.org/docs/latest-v24.x/api/fs.html): no-follow and platform-specific behavior inform operation-time path checks; do not claim kernel-enforced same-user isolation.
- [npm signature audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/) and [provenance format](https://github.com/npm/provenance): verify attestations, then assert expected source/workflow/package digest; decoded metadata alone is insufficient.
- [Sigstore JavaScript](https://docs.sigstore.dev/language_clients/javascript/): maintained verification library; exact package-engine requirements take precedence over the guide's older runtime floor. Bundle a versioned verifier rather than depend on an arbitrary user npm version.

Local inspection: only the six design Markdown files existed; no Git history or application code. `gh api user` reports hanselhansel. Target repository returns HTTP 404. Local Node is 24.4.1, npm 11.4.2; CI publishing will require a newer npm. `npm whoami` returned ENEEDAUTH. This is a publication dependency; no credentials have been inspected or exposed.

## Plan family and ordering

This master plan coordinates bounded subsystem plans. Before any subsystem implementation, its detailed file/API/test steps are written and included in the autoplan review. Shared contracts are frozen for the initial implementation pass before independent work begins.

Plan inputs: [shared contracts](robopomelo-contracts.md), [schema/core](robopomelo-core.md), [runtime/security/updater](robopomelo-runtime.md), [CLI and artifacts](robopomelo-cli-artifacts.md), [frontend](robopomelo-frontend.md), [integration and release](robopomelo-delivery.md), and [visual system](../../../DESIGN.md). The approved scope and delivery specification define first-release and future-capability boundaries.

| Stage | Files and responsibility | Verification |
| --- | --- | --- |
| 0 | Bootstrap docs/license/AGENTS/gitignore; independent branch and isolated worktree | Links, inventory, no source copied, clean bootstrap commit |
| 1 | `packages/spec`, `packages/core`, `examples/inbound-pallet` | Schema, all 27 RP rules, units, hashes, permissions/patches, truthful fixtures |
| 2 | `packages/project-fs` | Parser preservation, confinement, locks/journals, evidence/history, trust and conflict tests |
| 3 | `packages/artifacts`, `apps/cli` commands/server/wizard | Deterministic outputs, command contracts, complete TTY and non-TTY flow, HTTP boundaries |
| 4 | `apps/web`, design tokens/components/screens | All 11 views, keyboard/error/conflict flows, desktop/narrow/print visual checks |
| 5 | Runtime updater, Skills, distribution packaging | Pin/offline/verification/recovery, six Skill contracts, actual packed install |
| 6 | CI, documentation, whole-branch review and up to two global repairs | Full matrix, security, accessibility, golden files, all scope covered |
| 7 | Exact gstack ship then land-and-deploy; RC/stable verification | Live CI, release health, actual package provenance/install and local/live main equality |

## Task 0: documentation-only bootstrap

**Files:** `.gitignore`, `AGENTS.md`, `README.md`, `LICENSE`, approved `docs/superpowers/specs/`, this plan.

- [x] Verify document links, no unexpected files and canonical target identity.
- [x] Fetch the Apache-2.0 license from its official source.
- [x] Initialize independent history on chore/bootstrap and commit the reviewed documentation (d054f80).
- [x] Verify `.worktrees/` is ignored, then create `.worktrees/v1` on feat/v1.
- [x] Continue detailed planning in that worktree before product implementation.
- [x] Complete autoplan's sequential CEO, Design, DX and Eng review and required evidence.

Commands:

```sh
git init -b chore/bootstrap
git add .gitignore AGENTS.md README.md LICENSE docs/superpowers/specs docs/superpowers/plans
git commit -m 'docs: establish approved RoboPomelo design and execution boundary'
git check-ignore .worktrees/probe
git worktree add .worktrees/v1 -b feat/v1
```

Expected: one independent documentation commit, ignored worktree storage, clean feat/v1 worktree. There are no application tests yet; do not call documentation checks a passing product suite.

## Completion contract

The full v1 is the goal. No stage completion substitutes for delivery. Strict release runs after implemented scope and review evidence exist. A publication or platform-verification gap is reported as incomplete, not silently removed from acceptance criteria.

## Decision Audit Trail

| ID | Phase | Decision | Class | Principle | Reason | Rejected alternative |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Intake | Preserve full approved v1 | Prior user decision | P1 | User selected full implementation before discovery | Cut CLI/wizard/update scope |
| A2 | Intake | Use isolated Node 24.20.0 | Mechanical | P5 | Satisfy current verifier floor without global changes | Older unsupported global runtime |
| A3 | CEO | Add minimum meaningful review predicates and RP-013/RP-042 | Mechanical | P1 | Prevent vacuous readiness | Empty-container pass |
| A4 | CEO | Restore authoring state against current protected decisions | Mechanical | P1 | Preserve revocation/authority semantics | Raw source snapshot replacement |
| A5 | CEO | Add evaluateReview and shared Mutation input | Mechanical | P4 | One protected operation path | CLI-specific review-array writes |
| A6 | CEO | Allocate coordinator integration/release tasks | Mechanical | P1 | Publication requires concrete ownership and evidence | Treat source merge as release |
| A7 | CEO | Native execution matrix with exact floors and actual AT evidence | Mechanical | P1 | Avoid claiming untested platforms | WebKit/tree checks as native proof |
| A8 | CEO | One stable target with derived RC/stable artifact identity | Implementation choice | P5 | Preserve approved SemVer sequence and gstack writer | Modify global gstack or independently version Skills |
| A9 | CEO | Keep npm authentication/promotion as explicit release dependency | Mechanical | P5 | Actual ENEEDAUTH and OIDC scope require verification | Claim fully configured publication |
| A10 | CEO | Use independent native review with unavailable CLI voices labeled | Documented fallback | P6 | Both external CLI probes failed; keep review substance | False cross-model consensus |
| A11 | CEO | Post-release second-engineer rubric and threshold | Mechanical | P3 | Measure handoff usefulness before expanding | Reopen pre-build discovery gate |

## Autoplan completion and execution authority

CEO, Design, DX and Eng completed sequentially at plan level. [CEO](../../reviews/2026-09-05-autoplan-ceo.md), [Design](../../reviews/2026-09-05-autoplan-design.md), [DX](../../reviews/2026-09-05-autoplan-dx.md), [Eng](../../reviews/2026-09-05-autoplan-eng.md) and [27 aggregated implementation tasks](../../reviews/2026-09-05-autoplan-tasks.md) record findings and required verification. Independent native reviewers confirmed the focused corrections; external Codex/Claude CLI voices were unavailable. No cross-model agreement is claimed.

Hansel's end-to-end execution instruction already authorizes routine plan gates. No new unresolved taste choice or scope change requires another confirmation. The selected Editorial Studio direction follows the approved calm document-first product direction; Hansel did not review the new images. The image-check service was unavailable, so direct inspection was used and runtime visual QA remains required. Native OS/browser/assistive-technology evidence and npm authentication/publication remain execution dependencies.

The final engineering test-plan artifact is also stored under the project's private gstack directory for QA consumption. Five approved post-v1 capabilities are recorded in TODOS.md. No current v1 requirement was deferred. The release's one whole-branch review remains owned by ship, with at most two global implementation repair cycles.

## Final decision audit additions

| ID | Phase | Decision | Reason |
| --- | --- | --- | --- |
| A12 | Design | Explicit conflict choices and cumulative drafts | Preserve user work |
| A13 | Design | Record homes and empty/hidden finding navigation | Make every declared record editable |
| A14 | Design | Purpose/location evidence filters and core status detail | Avoid ambiguous evidence and approval labels |
| A15 | Design | Precise root trust, pagination and permission-repair navigation | Recover without losing work |
| A16 | DX | Durable rollback hold and shared version/policy selector | Deterministic next launch |
| A17 | DX | Finite commands never prompt in JSON/non-TTY | Bounded automation |
| A18 | DX | Literal installed quickstart and complete command matrix | Distributed behavior is acceptance evidence |
| A19 | DX | New-folder recovery after failed/successful migration | Preserve original source |
| A20 | Eng | Evidence final-path publication before source commit | No committed missing attachment |
| A21 | Eng | Core-owned persistent approval invalidations | Revert cannot resurrect approval |
| A22 | Eng | Candidate-selection approval gating | No stale-warning acknowledgment loop |
| A23 | Eng | Proposed state and digest-bound receipt lookup | Distinguish proposal, commit and unknown outcome |
| A24 | Eng | Typed verification declarations and protected attestations | Implement reserved RP-062 truthfully |
| A25 | Eng | Plain display text and single escaping layer | Preserve text safely |
| A26 | Eng | Bounded benchmark and explicit pre-ship artifact target | Measure performance and preserve release identity |

All additions are mechanical completeness or integration corrections under the approved scope. Automatic update settings remain exposed through both browser and CLI; no test execution/result assessment was introduced. No product test is marked passing by a plan review.

## GSTACK REVIEW REPORT

| Review | Runs | Status | Findings |
| --- | ---: | --- | --- |
| CEO | 1 | CLEAR, plan | Six independent findings corrected; confirmation 89/100 |
| Design | 1 | CLEAR, plan | Seven findings corrected; primary completeness 9.2/10 |
| DX | 1 | CLEAR, plan | Six findings corrected; primary completeness 8.75/10; TTHW unmeasured |
| Eng | 1 | CLEAR, plan | Six independent gaps plus two primary clarifications; focused confirmation clear |
| External CLI voices | 0 completed | UNAVAILABLE | Codex model probe and Claude OAuth failed; native same-model reviews separately recorded |

VERDICT: CEO, Design, DX and Eng plans cleared for authorized implementation. Application tests, release credentials, native platform evidence and publication remain required execution work.

NO UNRESOLVED DECISIONS
