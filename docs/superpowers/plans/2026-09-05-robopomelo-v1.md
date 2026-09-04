# RoboPomelo v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Respect the three-concurrent-agent limit.

**Goal:** Deliver the full approved RoboPomelo v1, verify its distributed release, and reconcile canonical local main with live GitHub main.

**Architecture:** One deterministic domain core and portable folder transaction layer support browser, CLI, terminal wizard and Skills. The updater is a bounded machine-local subsystem; operator decisions remain separate from authoring grants.

**Tech Stack:** TypeScript; Node 24 with Node 22 compatibility; npm workspaces; React and Vite browser assets; JSON Schema 2020-12, a data-only YAML document parser, deterministic rendering, Node filesystem/HTTP adapters, Vitest and Playwright. Exact locked dependencies follow the current-practice and package inspection recorded below.

## Routing and authorization

Deep tier because this is a new architecture with a public contract, filesystem/access boundary, automatic updater and coupled interfaces. Hansel's 2026-09-05 instruction to implement end to end authorizes proceeding from written-spec delivery. Settled product choices stand. Routine plan/review/merge proceed gates are authorized; the user's strict material stop conditions remain binding.

Research budget: at most ten decision-relevant queries before reassessment. Initial pass used three queries and four primary pages, retrieved 2026-09-05:

- [Node release schedule](https://nodejs.org/en/about/previous-releases): Node 24 and 22 are supported LTS lines; Node 20 is EOL. Use Node 24 for development and a 22/24 runtime matrix.
- [Vite guide](https://vite.dev/guide/): bundled production assets; supported Node minimums fit the chosen runtime matrix. Use no runtime CDN.
- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/): direct publishing must be explicitly allowed for new trusted-publisher configurations after 2026-09-03; OIDC publish requires supported npm/Node versions.
- [npm trust CLI](https://docs.npmjs.com/cli/v11/commands/npm-trust/): account authentication/2FA is separate from CI publication. Resolve actual account capabilities before claiming publication.

Local inspection: only the six design Markdown files existed; no Git history or application code. `gh api user` reports hanselhansel. Target repository returns HTTP 404. Local Node is 24.4.1, npm 11.4.2; CI publishing will require a newer npm. `npm whoami` returned ENEEDAUTH. This is a publication dependency; no credentials have been inspected or exposed.

## Plan family and ordering

This master plan coordinates bounded subsystem plans. Before any subsystem implementation, its detailed file/API/test steps are written and included in the autoplan review. Shared contracts are frozen for the initial implementation pass before independent work begins.

| Stage | Files and responsibility | Verification |
| --- | --- | --- |
| 0 | Bootstrap docs/license/AGENTS/gitignore; independent branch and isolated worktree | Links, inventory, no source copied, clean bootstrap commit |
| 1 | `packages/spec`, `packages/core`, `examples/inbound-pallet` | Schema, all 25 RP rules, units, hashes, permissions/patches, truthful fixtures |
| 2 | `packages/project-fs` | Parser preservation, confinement, locks/journals, evidence/history, trust and conflict tests |
| 3 | `packages/artifacts`, `apps/cli` commands/server/wizard | Deterministic outputs, command contracts, complete TTY and non-TTY flow, HTTP boundaries |
| 4 | `apps/web`, design tokens/components/screens | All 11 views, keyboard/error/conflict flows, desktop/narrow/print visual checks |
| 5 | Runtime updater, Skills, distribution packaging | Pin/offline/verification/recovery, six Skill contracts, actual packed install |
| 6 | CI, documentation, whole-branch review and up to two global repairs | Full matrix, security, accessibility, golden files, all scope covered |
| 7 | Exact gstack ship then land-and-deploy; RC/stable verification | Live CI, release health, actual package provenance/install and local/live main equality |

## Task 0: documentation-only bootstrap

**Files:** `.gitignore`, `AGENTS.md`, `README.md`, `LICENSE`, approved `docs/superpowers/specs/`, this plan.

- [ ] Verify document links, no unexpected files and canonical target identity.
- [ ] Fetch the Apache-2.0 license from its official source.
- [ ] Initialize independent history on chore/bootstrap and commit the reviewed documentation.
- [ ] Verify `.worktrees/` is ignored, then create `.worktrees/v1` on feat/v1.
- [ ] Continue detailed planning and autoplan in that worktree before product implementation.

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
