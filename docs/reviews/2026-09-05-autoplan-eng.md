# RoboPomelo engineering plan review

Date: 2026-09-05. Target: the final amended v1 plan family on feat/v1. Mode: FULL_REVIEW via autoplan. This review follows CEO, Design and DX. Routine mechanical decisions are preauthorized; no settled product scope is reopened. Product code and product tests do not yet exist. All coverage below is required work, not passing evidence.

## Step 0: scope and reuse

The repository contains an independent documentation bootstrap, VERSION baseline and reviewed specifications. There is no preexisting runtime, schema engine, UI or test framework to reuse. Reuse the approved shared contracts across the adapters, and use maintained Ajv, YAML AST, SHA-256, Sigstore, archive and browser tooling. Node supplies HTTP, crypto, streams and filesystem primitives. The current-practice pass retrieved official Node, Vite, npm and Sigstore sources on 2026-09-05; seven targeted queries supported these decisions. No additional broad searches are needed.

The plan necessarily exceeds eight files and two services because the approved objective includes a public specification, portable transactions, browser/terminal/Skills and secure automatic updates. Removing these would contradict the repeatedly approved full-v1 scope. Complexity is reduced through one core, one filesystem transaction service, one field registry and one generated distribution. No database, hosted service, model client, native sandbox or generic plugin framework is introduced. The public distribution pipeline is part of the plan and cannot be replaced by a successful source merge.

## 1. Architecture

```text
closed JSON Schemas + types + field/capability registries
                         |
             deterministic core
             /       |        \
      validation   mutation   projection
             \       |        /
              portable project session
        /          |          |          \
     safe FS    transactions evidence   grants
        \          |          |          /
         CLI/wizard + authenticated loopback API
                 |                    |
        Skills call CLI            React UI
                 \                    /
                 same exports/manifest

independent launcher lock -> metadata/download -> verify publisher/digest
     -> bounded inert extraction -> compatibility -> immutable runtime
     -> session pinned to exact version; no project network payload
```

The package dependency direction is appropriate: spec is pure contract, core owns decisions, project-fs owns effects, artifacts owns presentation, CLI/server and browser are adapters. Avoid an accidental dependency cycle where project-fs imports CLI export streaming; inject an artifact payload plan or keep export orchestration in the application layer. The runtime plan's session.export must not become a second renderer. One snapshot carries the exact source identity, observations and core results to every interface.

Security rests on an explicit local attacker boundary. Malicious project data cannot choose host paths, execute code, grant authority or bypass update verification. Pure Node path checks do not establish a kernel sandbox against an unrestricted hostile same-user process; that residual is already documented. HTTP origin, host, session and CSRF checks protect a loopback service against websites and unauthenticated clients. Grant generation is checked under the machine-settings lock at the source commit point, with a fixed project-before-settings order. No user-controlled text is an instruction or shell fragment.

Distribution is coupled to exact artifact identity and current npm publishing behavior. The candidate and stable identities are preapproved; gstack's three-part writer owns the stable target. The generated package contains its own assets and verification dependencies. Publisher authentication and native execution evidence are real release dependencies. They are neither plan failures to hide nor reasons to omit independently implementable work.

## 2. Code quality

The common types and closed schemas prevent a permissive object bag from replacing the public contract. Adapters deserialize unknown input and call shared evaluators; they must not reimplement readiness, permissions or approval validity. The field registry covers browser and wizard editors, command registry covers help/JSON tests, and the capability registry covers Skills/release compatibility. Each source file remains below 400 lines, with generated outputs excluded from authored-source limits.

Errors are explicit domain/runtime codes with safe human actions. Preserve typed knowledge states, zero/false values, decimal string precision and ordered flow steps. Core ReviewDocument fields must be plain text; renderer-specific escaping happens exactly once. Earlier wording calling them escaped-display data is clarified as plain display data. Imported history/journals/settings are untrusted and schema/resource validated just like deployment.yaml.

No application code exists for retrospective regression comparison. Existing planning changes address missing minimum-readiness predicates, restore protection, conflict handling and update recovery. These are mandatory behavioral regression fixtures for implementation. Avoid test-only production methods: inject clocks/network/FS fault hooks behind real service dependencies, and use actual subprocess/HTTP/browser tests where mocks would hide integration failures.

## 3. Test review and coverage diagram

No test framework is installed yet. Vitest and Playwright are selected in the delivery plan, and the first tooling task establishes them. The following maps every planned entry family, important conditional branch, effect and user flow. Every row is currently GAP (not implemented), with an explicit required test owner. Unit tests cover pure semantics; real process/HTTP/browser/distribution tests cover boundaries. There are no product model calls; Skill contract/orchestration fixtures are deterministic and actual host coverage is reported separately.

```text
INPUT / ENTRY                   BRANCH / TRANSFORMATION                   REQUIRED TEST
schema check                    valid/invalid version/type/unknown key    schema.test
safe YAML parse                 aliases/tags/duplicate/depth/UTF-8        runtime/yaml
record index                    missing/duplicate/wrong-kind/nested ID    primitives/rules
quantity compare                zero/negative/decimal/unit/subject        primitives
planning projection             order/revision/review/material changes    primitives/reviews
validate                        all 27 rules + applicability/no records   rules
patch check/diff                 stale/scope/invalid/valid draft           patches + CLI
patch apply                      proposal/autonomous/replay/conflict      [E2E] commands/session
review input                     approved/rejected/changes-requested      reviews + CLI/browser
review input                     ack/waiver/ineligible/missing evidence   reviews + CLI/browser
review validity                  material/rule/evidence/revoke/restore    reviews + history
source transaction               old -> staged -> committed -> finalized [E2E] crash/recovery
source transaction               stale writer/revoked grant/disk full     [E2E] multiprocess
recovery                         source=old/new/neither, missing staging  runtime/recovery
project open                     blank/example/invalid/unsupported        [E2E] CLI/browser
external edit                    valid reconcile/invalid preserve         [E2E] runtime/browser
root selection                   copy/move/replacement/denied              security/trust
safe file operation              traversal/link/junction/hardlink/race    [E2E] native confinement
evidence copy                    explicit file/abort/change/size limit    runtime/evidence
observation                      present/missing/mismatch/external/future runtime/evidence + rules
evidence remove                  linked/allowed/history retained          runtime/evidence
history restore                  current base/protected/revoked/missing   [E2E] runtime/history
migration                        preview/no path/backup failure/success   runtime/migrations
migration recovery               failed + committed/new empty folder      [E2E] distribution
export preview                   selected/omitted/stale/base               artifacts + browser
export write                     exact bytes/stream change/abort/limit    [E2E] export-roundtrip
HTTP bootstrap                   origin/host/expired/reused token         [E2E] HTTP/browser
HTTP request                     auth/CSRF/content-type/limit/epoch       [E2E] HTTP/security
HTTP response                    malicious text/remote assets/download    [E2E] Markdown/browser
server shutdown                  idle/in-flight commit/journal outcome    [E2E] subprocess
CLI finite leaf                  help/JSON/non-TTY/exit/closed stdin      [E2E] every-leaf matrix
wizard                           five steps/back/unknown/cancel/review    [E2E] native PTY
browser draft                    partial input/save/409/disconnect        [E2E] recovery
browser navigation               flush/park permission repair/switch      [E2E] recovery
browser review                   finding target/empty/deleted/hidden      [E2E] review
browser evidence/history/change  filters/proposals/restore/download       [E2E] planning
browser a11y                     keyboard/dialog/focus/zoom/announcements [E2E] axe + actual AT
browser print                    A4/Letter/long table/unknown/hash        PDF visual inspection
launcher select                  bundled/cache/pin/hold/offline/explicit  distribution/launcher
updater fetch                    allowed redirect/timeout/limit/offline   distribution/updater
updater verify                   issuer/repo/workflow/subject/digest      provenance fixtures + real RC
updater extract                  links/traversal/collision/bomb/scripts   extraction
updater promote                  compatibility/handshake/crash/rollback   [E2E] two-runtime restart
Skills                           trigger/read-write/dependency/stop       skill/orchestration fixtures
package                          assets/version/allowlist/clean install   [E2E] packed/published package
release                          RC proof/stable proof/latest/readback    [E2E] registry/CI/health
```

Test qualities are targets, not achieved stars: behavioral assertions, edge cases and failure handling for each row. Every RP rule requires a positive fixture and applicability counterexample. The same fixture must produce identical domain conclusions through browser and CLI. Golden exports freeze source, observations and versions; compare actual archive member hashes and bytes, not only filenames. No generated artifact can claim a hash before actual serialization.

The highest-risk integration paths are transaction crash recovery, revoked authority, copied-root trust, poisoned project files, authenticated browser mutations and verified updater execution. Tests use real processes, native path semantics and production verification policy on the actual RC. Synthetic signing fixtures prove rejection and recovery behavior but cannot prove the release publisher's identity. Actual screen-reader navigation is separate from an accessibility tree. All unexecuted platform cells stay unverified.

## 4. Performance

The supported project cap is 8 MiB source and 10,000 records; attachments are streamed, capped individually and in selected export totals. Build one reference index per validation pass, avoid per-record whole-project scans, and cache only by exact source hash plus observation/rule context. A cache must never make changed required evidence look current. Evidence hashing is streamed and explicit; validation shares one frozen observation set rather than reopening every attachment for each rule.

Browser lists use 50-row pagination/search with stable focus restoration. Draft updates serialize rather than race, and validation is debounced while still rechecking under commit. No infinite event loop, unconstrained archive expansion or synchronous multi-gigabyte buffering is acceptable. Add a repeatable 10,000-record fixture benchmark with hardware/Node/browser versions, peak RSS, parse/validate/export time and interaction long tasks; establish baseline, then enforce a regression budget. The initial acceptance target is editable controls responding within 200 ms on the recorded test machine and no unbounded growth across repeated saves. Do not invent universal performance guarantees from one laptop.

## Failure-mode registry

All rows are planned tests and planned handling. None is counted as implemented.

| Failure | Planned test | Handling and user visibility |
| --- | --- | --- |
| Invalid or external source | YAML/reconcile | Inspection state, raw bytes retained, location/action |
| Duplicate/stale mutation | idempotency/multiprocess | Original result or 409, pending edits retained |
| Grant revoked during commit | trust process fixture | Denied before source replacement, explicit scope error |
| Disk full after source replacement | crash journal fixtures | Finalize/recover known hash; never false precommit retry |
| Missing/tampered history | history/recovery | Inspect without overwrite; preserve candidates |
| Escaping link/junction | native confinement | Reject operation with safe path error |
| Evidence changes in export | streaming fixture | Abort incomplete artifact, retain selection |
| Forged browser request | HTTP fixtures | 403, no read/mutation or credential disclosure |
| Unsafe Markdown/attachment | browser security | Text/sanitized output or download, no active origin content |
| Updater timeout/unverified payload | updater/provenance | Old usable runtime retained; explicit outcome |
| Bad cache selection or rollback | launcher restart | Exact failure or durable hold, never silent wrong version |
| Migration failure | backup/migration | Source unchanged before commit; new-folder recovery |
| Missing published asset | clean installed fixture | Release verification fails, no latest promotion |
| Failing native CI or unhealthy release | required aggregate/health | Strict stop, preserve evidence |

No silent failure without both a test assignment and error handling is accepted. Outstanding implementation gaps remain in the plan and release checklist.

## Parallelization

| Lane | Modules | Dependencies |
| --- | --- | --- |
| A | spec, core | Tooling baseline; shared contract owner |
| B | artifact formatting | Frozen spec/core projection contracts |
| C | project-fs, server | Core evaluators; runtime contracts |
| D | web | Frozen field/API contracts and later real server |
| E | CLI, wizard, Skills | Core and session operations |
| F | updater/distribution/CI | Tooling, complete runtime payload, publication account |

Root owns shared contracts/tooling/CI/integration. At most two independent workers plus root may run. No two workers edit shared manifests, contracts or the same module directory. A precedes C/E; B may proceed against frozen projection types; D may implement typed client/components independently after contract freeze. Final integration and release are sequential. Use the existing isolated feat/v1 worktree, explicit ownership and coherent green commits; additional worktrees only when a concrete conflicting lane requires them. The user's single whole-branch release review overrides redundant final-review suggestions in generic execution skills.

## Deferred and existing work

Existing: reviewed design, six specifications, plan family, isolated branch/worktree and official license. Deferred scope remains the approved future phases: Git/local LLM/MCP, layouts/capacity, simulation adapters, test execution/result assessment and telemetry evidence. These are recorded in TODOS.md with dependencies and the detailed roadmap link. No deferred item is required to make a truthful v1 engineering handoff.

## Independent challenge and resolution

The fresh native reviewer found six material contract gaps, each confirmed in the written plan: evidence final-path ordering, durable approval invalidation, stale-approval replacement ordering, proposed browser drafts, mutation receipt lookup and the missing RP-062 verification declaration. All six are now defined in the integration contracts and corresponding subsystem tasks. Focused confirmation found no introduced material contradiction. This is same-model independence; Codex CLI and Claude CLI were unavailable. Cross-model agreement is N/A for all six dimensions, not confirmed.

Primary review added plain-text rendering/escaping clarification and a recorded large-project performance budget. These are mechanical changes in the direct blast radius. All eight corrections choose the complete approved behavior. No unresolved product/architecture decision remains. Actual implementation, native platform coverage, npm authentication and published release proof remain required work.

## Implementation Tasks

- [ ] **T1 (P1, human: ~2-4h / CC: ~20-40min)**: Publish immutable evidence before source commit. Component: Transactions. Files: `packages/project-fs/src/transactions`. Verify its named regression family in the test diagram.
- [ ] **T2 (P1, human: ~2-4h / CC: ~20-40min)**: Persist invalidation so revert cannot resurrect approval. Component: Approval validity. Files: `packages/core/src/review-validity.ts`. Verify its named regression family in the test diagram.
- [ ] **T3 (P1, human: ~2-4h / CC: ~20-40min)**: Gate candidate selection without historical warning loop. Component: Approval replacement. Files: `packages/core/src/reviews.ts`. Verify its named regression family in the test diagram.
- [ ] **T4 (P1, human: ~2-4h / CC: ~20-40min)**: Keep proposed cumulative draft separate from committed source. Component: Proposal UX. Files: `apps/web/src/state/drafts.ts`. Verify its named regression family in the test diagram.
- [ ] **T5 (P1, human: ~2-4h / CC: ~20-40min)**: Reconcile unknown mutation outcomes through digest-bound lookup. Component: Receipts. Files: `packages/project-fs/src/session.ts`. Verify its named regression family in the test diagram.
- [ ] **T6 (P1, human: ~2-4h / CC: ~20-40min)**: Define required support and protected attributed attestations. Component: Verification contract. Files: `packages/spec/src/common.ts`. Verify its named regression family in the test diagram.
- [ ] **T7 (P1, human: ~2-4h / CC: ~20-40min)**: Keep plain display text and one escaping layer. Component: Rendering. Files: `packages/artifacts/src`. Verify its named regression family in the test diagram.
- [ ] **T8 (P1, human: ~2-4h / CC: ~20-40min)**: Measure bounded large-project behavior and enforce regression budget. Component: Performance. Files: `tests/distribution`. Verify its named regression family in the test diagram.

## Completion summary

Scope accepted as already approved. Architecture: five gaps (evidence ordering, invalidation, replacement ordering, receipts, verification schema). Code quality: one escaping-contract clarification. Tests: full diagram produced, all planned families assigned and six independent regressions added. Performance: one acceptance-budget gap addressed. UI integration: one proposal-state contract corrected. Failure modes: no unassigned silent critical path remains in the plan. Existing/deferred work documented, five approved roadmap items recorded in TODOS.md. Parallelization: six dependency lanes, at most two independent workers plus root. Lake score: 8/8 complete-option corrections. External CLI voices unavailable; independent native challenge completed with focused confirmation. Plan clear to implement, no claim of passing application evidence.
