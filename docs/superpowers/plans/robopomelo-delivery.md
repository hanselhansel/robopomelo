# RoboPomelo integration and strict delivery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. The coordinator owns this plan, exact gstack ship/land-and-deploy execution and final evidence. Do not duplicate release-owned whole-branch reviews.

**Goal:** Turn the approved subsystem work into one installable, verified release with protected GitHub main and synchronized canonical local main.

**Architecture:** Private npm workspaces build one generated public RoboPomelo distribution. Repository release target and candidate/stable artifact identities share one train. CI validates source and distributions; publication and channel promotion have explicit evidence and authorization checks.

**Tech Stack:** Node 24.20.0 for local work, Node 22/24 CI, npm workspaces, locked TypeScript/React/Vite/Vitest tooling, Playwright, GitHub Actions, Changesets and npm trusted publishing.

## Runtime and dependency decisions

The isolated local Node runtime is `/Users/hansel/.cache/robopomelo-build/node-v24.20.0-darwin-arm64/bin/node`, downloaded from the official Node distribution and checked against its SHA-256 manifest on 2026-09-05. Archive hash: `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8`. Do not change the user's global Node installation. Use the isolated bin directory in the environment of build/test subprocesses.

Supported runtime floor is `^22.22.2 || ^24.15.0`, matching the selected maintained Sigstore verifier. Actual local verification uses 24.20.0. CI resolves current patches on the 22 and 24 lines and records exact versions. User-facing errors explain unsupported versions before reading a project or checking updates.

Registry metadata inspected 2026-09-05: TypeScript 7.0.2, Vite 8.2.2, React 19.2.8, Vitest 5.0.0, Ajv 8.20.0, yaml 2.9.0, sigstore 5.0.0, @noble/hashes 2.4.0, yazl 3.3.1 and semver 7.8.5. Lock these deliberately after verifying package engines/peer dependencies; obtain matching react-dom, type packages, Vite React plugin, Playwright/axe/testing packages, Changesets and font packages during tooling setup. A conflicting peer range is resolved before a lockfile is declared green. Do not install an older verifier merely to fit the global Node 24.4.1.

The direct registry lookups are exact package metadata inspection, not additional landscape searches. Seven targeted web research queries have been used; the last confirmed current native GitHub runner labels. Stop broad research here; further queries require a concrete new decision and reassessment of the ten-query budget.

## Files owned by the coordinator

| Files | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json`, `VERSION`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts` | Private workspace scripts, version target and test/build configuration |
| `packages/*/package.json`, `apps/*/package.json`, scoped tsconfigs | Explicit private workspace imports and dependency boundaries |
| `scripts/{build,package,check-runtime,check-boundaries,check-source-lines,check-docs,check-skills,check-plan-coverage}.mjs` | Build/contract/structure checks without application business logic |
| `scripts/{verify-package,verify-release,promote-release,release-manifest,verify-versions}.mjs` | Actual distributable and public release checks |
| `packaging/{manifest,files,compatibility}.json` | Public package identity, payload allowlist and release compatibility inputs |
| `.changeset/config.json`, `.changeset/*.md` | Coordinated release intent and notes |
| `.github/workflows/{ci,distribution,release}.yml` | Source matrix, packaged matrix and OIDC publication |
| `.github/{pull_request_template.md,CODEOWNERS}`, `.github/ISSUE_TEMPLATE/` | Contribution and review routing |
| `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/verification/` | Security/contribution guidance, release record and actual evidence |
| `tests/distribution/{package,release-manifest,version-policy}.test.ts`, `tests/browser/native-safari.test.ts` | Distribution contents and native browser checks |

Execution ordering: Task 2 establishes the public protected baseline before Task 1 creates application/tooling source. Planning and read-only dependency inspection can precede it.

## Task 1: workspace tooling and deterministic build

- [ ] Create a private root workspace manifest named `@robopomelo/workspace`, starting at repository version `0.0.0`, with `packages/*` and `apps/*` workspaces. The public package `robopomelo` is generated under ignored `dist/package`; private workspaces are not separately published.
- [ ] Define scripts `build`, `typecheck`, `test`, `test:coverage`, `test:browser`, `check:boundaries`, `check:source-lines`, `check:docs`, `check:skills`, `check:plan-coverage`, `verify:package` and `verify:release`. Use local dependencies and exact argument forwarding; scripts never default to a production publish.
- [ ] Implement check scripts before relying on their green result. Boundaries reject core imports of Node FS/network/UI, reverse package dependencies, cycles and server imports in browser code. Source-line checks examine actual source and workflow files, excluding generated distribution/report files; split authored source at 400 lines. Documentation checks validate relative links without following external links automatically.
- [ ] Configure TypeScript strict mode and workspace-aware module resolution. JSON Schema remains the public authority; type/field-definition fixtures are checked against it. Keep configuration files explicit and small.
- [ ] Build CLI/launcher as Node ESM with exact artifact-version injection; build browser into local static assets through Vite. Bundle required fonts and licenses. No source checkout paths, private environment values or dynamic project data enter generated bundles.
- [ ] Install locked dependencies in the isolated runtime. Inspect any required installation script/native development dependency and keep it out of the published runtime where not required. Run typecheck and applicable tooling tests; commit the first green scaffold. An empty test selection is reported as such, not product verification.

## Task 2: establish public remote and branch protection

The local documentation bootstrap commit d054f80 already exists, made on chore/bootstrap; local main and feat/v1 originated there. Before remote seeding, add the initial VERSION value 0.0.0 on chore/bootstrap as release-baseline metadata, fast-forward local main and bring that nonconflicting baseline into feat/v1. This is the initial declaration, not a release bump. Ship owns later bumps. No remote has been created or pushed yet.

- [ ] Recheck target GitHub identity/absence and canonical path before remote creation. Create the requested public repository with no server-generated conflicting history.
- [ ] Push the existing documentation bootstrap branch, create remote main at that exact commit using a ref operation, set main as default and enable protection before publishing feature changes. No force operation is permitted.
- [ ] Configure required PRs, no second-human approval count initially, strict current-base checks, conversation resolution, linear/squash history, blocked force/delete and admin enforcement. Record readback from GitHub. Only checks actually implemented and emitted are required at bootstrap; full CI is required before product merge.
- [ ] Add contribution templates, code ownership and SECURITY guidance through feat/v1. Configure Actions default read permissions. Fork PRs cannot use publishing/OIDC credentials or privileged pull_request_target execution.

Initial remote commands, only after absence/ownership checks:

```sh
gh repo create hanselhansel/robopomelo --public --description 'Local, open-source AMR deployment planning and engineering handoff'
git remote add origin https://github.com/hanselhansel/robopomelo.git
git push -u origin chore/bootstrap
gh api repos/hanselhansel/robopomelo/git/refs -f ref=refs/heads/main -f sha="$(git rev-parse chore/bootstrap)"
gh repo edit hanselhansel/robopomelo --default-branch main --enable-squash-merge --disable-merge-commit --disable-rebase-merge
git fetch origin
git branch --set-upstream-to=origin/main main
```

This is the approved initial-history establishment, not an implementation release. Feature publication then uses the exact ship workflow. A surprise existing repository/ref or merge conflict is a stop condition, not permission to replace it.

## Task 3: executable CI and acceptance matrix

- [ ] Create CI jobs for source checks, schema/core/rule coverage, storage/security/recovery, CLI/wizard/artifacts/Skills, browser flows and offline behavior. One always-running `required-ci` aggregate checks the expected applicable job set; canceled, unexpectedly skipped or missing jobs fail it.
- [ ] Use current primary-supported native runner labels. Pin Actions to reviewed full commit IDs when writing workflows and record the resolved action versions. Run against the feature branch without a bypass. A failing CI run triggers Hansel's strict stop condition; do not relabel or ignore it to merge.
- [ ] Apply exact Node floors. Record OS/architecture/runtime in artifacts. Linux/Windows/macOS execution is native; no Docker or WSL is required by the product or substituted for native test evidence.
- [ ] Install Playwright browser dependencies only in test environments. Keep each distribution test isolated from the source checkout, with fresh project and machine-state directories and explicit offline/update policy.
- [ ] Add real PTY tests through a dev-only adapter if required; its compiler or prebuilt binary is a development dependency, not a shipped runtime requirement.

| Environment | Executor | Required evidence |
| --- | --- | --- |
| Linux x64, Node 22 and 24 | ubuntu-24.04 Actions | Schema/core, storage/security, CLI/wizard, packed install, exports/offline, browser engines |
| Windows x64, Node 22 and 24 | windows-2025 Actions | Native paths/junctions/locks/rename, CLI/PTY, packed install, exports/offline, Chrome/Edge smoke |
| macOS arm64, Node 22 and 24 | macos-15 Actions plus local 24.20.0 | Native transactions, CLI/PTY, packed install, browser/print flows |
| macOS x64, Node 24 | macos-15-intel Actions | Installation/runtime/evidence/export smoke and native filesystem checks |
| Chrome/Edge/Firefox current stable | Built app and actual browser binary where available; Actions/local | Versioned real-browser end-to-end results and screenshots |
| Safari current stable | macOS Safari/safaridriver or local native browser interaction | Actual Safari version, exercised flows and screenshots; WebKit alone does not satisfy it |
| VoiceOver plus Safari | Local macOS accessible session | Actual screen-reader navigation/announcements recorded; tree inspection alone does not satisfy it |
| A4/Letter and 320/768/1024/1440 CSS px | Built app, browser/PDF rendering | Inspected pages/screens with no clipped controls or omitted findings |

Other architectures remain unverified rather than silently claimed. The named matrix preserves all three approved operating systems. Investigate missing executor access before release; report the exact dependency if it cannot be exercised.

Runner reference retrieved 2026-09-05: [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Public-repository standard runners provide the listed native environments; this does not prove an actual run has passed.

## Task 4: generated public package and version identity

- [ ] Generate public `dist/package/package.json` with name robopomelo, Apache-2.0, exact supported engines, bin path, public repository identity, explicit file allowlist and exact runtime dependencies or a self-contained runtime payload. Include all non-code verification/trust assets required by dependencies. Package from this directory, never publish the private workspace root.
- [ ] Keep repository VERSION/private workspace manifest in gstack-compatible three-part SemVer. The preapproved first stable target is 1.0.0. Derive candidate artifact 1.0.0-rc.1 from that target and channel, then stable artifact 1.0.0. This is one release train with artifact maturity suffixes, not independently versioned Skills/packages. Do not place an unsupported prerelease string into gstack's stable version writer or patch the user's global gstack installation.
- [ ] Assert target/channel/artifact identity in build and package tests. Every CLI/UI/Skill compatibility stamp and generated artifact must report the actual installed artifact version, including rc.1. A source target of 1.0.0 is not reported as a stable package publication before registry verification.
- [ ] Changesets records intent for the coordinated target and generates its change summary. Ship's tested version helper owns VERSION/private root manifest/lock synchronization; no competing manual writer races it. The first 1.0.0 target and rc.1 sequence are already user-approved. An unexpected version/collision or any proposed different release number is a stop condition.
- [ ] Test actual tarball file inventory, missing assets, schema/Skill version drift, independent directory installation, CLI smoke, browser launch, reference project and deterministic export. Candidate code is not executed before its verification gate during updates.

Example package assertion:

```ts
it('derives candidate and stable identities from one target', () => {
  expect(artifactVersion('1.0.0', 'rc', 1)).toBe('1.0.0-rc.1');
  expect(artifactVersion('1.0.0', 'stable')).toBe('1.0.0');
  expect(() => artifactVersion('1.0.0-rc.1', 'stable')).toThrow();
});
```

`artifactVersion` lives in the coordinator's release-manifest module and accepts only validated three-part targets plus an explicit channel/index. It does not change repository versions or choose a release level.

## Task 5: publication authorization and channel gates

- [ ] Resolve npm account/package ownership and trusted publisher configuration using the actual npm/browser flows. Current local npm authentication is absent (ENEEDAUTH). Do not read credentials into model output, create a placeholder package, or claim publication is ready merely because GitHub auth works.
- [ ] Configure exact repository/workflow OIDC with direct npm publish allowed. The trusted-publisher documentation changed defaults on 2026-09-03. Keep id-token write scoped to the publication job running authorized main source.
- [ ] Build/test/publish rc.1 on an explicit candidate tag, install the actual published package, verify provenance and exercise distributed behavior. On failure, stop and preserve the failed release evidence; do not promote it.
- [ ] Rebuild the stable metadata/artifact and run packed checks again. Publish stable 1.0.0 to a non-default verification tag. Verify the actual registry artifact and installed commands before promoting latest.
- [ ] Channel promotion is a separate registry authorization capability. OIDC documentation guarantees publish/stage, not every dist-tag operation. Validate the available promotion path with the actual account. An authenticated maintainer CLI may perform `npm dist-tag add robopomelo@1.0.0 latest` after proof checks under the existing execution authorization. If fully CI-owned promotion needs a credential that is unavailable, retain a publication dependency; never silently publish latest early or claim OIDC covers unsupported actions.
- [ ] Implement promotion script that requires exact version, digest and passing published-artifact proof, then performs the authorized tag operation and reads it back. No automatic unpublish, force-tag replacement to an unrelated version or destructive recovery.
- [ ] Verify latest resolution and a clean fresh install after promotion. The updater's own verified identity/compatibility checks remain in force; a registry tag is not enough to execute an arbitrary package.

Expected public identities are rc.1 on the candidate channel first, then exact stable 1.0.0 on the default channel after evidence. Authentication/setup gaps do not prevent local implementation, but they prevent claiming this release stage complete.

## Task 6: strict ship and land-and-deploy

- [ ] Load and execute gstack ship in full after the implementation and planned verification exist. Preserve its tests, coverage, reviews, versioning, CI, documentation and evidence behavior. Use ship's whole-branch review as the required whole-branch review; do not run an extra equivalent review immediately beforehand.
- [ ] Apply at most two global implementation repair cycles. Focused TDD fixes and planning corrections are not extra whole-branch reviews. Stop if a material finding remains unresolved at the allowed boundary.
- [ ] Execute gstack land-and-deploy in full after ship creates the PR. Configure its deployment contract for package distribution and release health, not a hosted application. First-run dry-run validation is performed with the already authorized routine green proceed decision; any material warning remains a stop.
- [ ] Wait for actual source CI, merge and distribution jobs. Run the configured package verification/promotion/health commands through the authorized workflow. No deployment is claimed from a source merge alone.
- [ ] Reopen authoritative live GitHub main and actual npm/channel state at completion. Sync canonical local main by fast-forward, preserving unrelated working-tree changes. Verify clean state only if it is actually clean.

Final checks include:

```sh
git fetch origin
git rev-parse main
git ls-remote origin refs/heads/main
git status --short
npm view robopomelo@1.0.0 version dist.integrity dist.attestations --json
npm view robopomelo dist-tags --json
```

Run those in the appropriate canonical checkout or explicit registry context. Matching cached refs are insufficient. Do not reset or discard unrelated work to make status empty.

## Task 7: operational documents and post-release learning

- [ ] Replace the implementation-in-progress README only when its installation instructions correspond to an actually available release. Write CLI/browser/offline/trust/update/recovery/contribution guides with exact commands and honest platform limits.
- [ ] Maintain release evidence under docs/verification with commit, package digest, versions, commands and real outcomes. Keep session/bootstrap secrets, private project paths and raw credential output out of artifacts.
- [ ] Record observed post-release learning protocol without creating a pre-build customer-discovery gate or sending outreach: five practitioners perform a bounded inbound-material-flow planning task using their existing method and RoboPomelo; a second engineer reviews the package without interviewing its author. Use authorized, sanitized inputs.
- [ ] Predeclare usable handoff as the second engineer correctly identifying the intended flow, a measurable criterion, responsible approver, open assumptions/risks and the next required engineering inputs, with no critical omission hidden by a ready label. Count reconstruction questions and completion time against the observed existing-method baseline.
- [ ] Continue the current workflow direction if at least four of five handoffs satisfy that rubric without a critical omission. Otherwise prioritize the repeated failure pattern in the core workflow before new adapters. Treat this as a learning threshold, not statistical validation or a promise of business impact.

## Final engineering implementation requirements

- [ ] Add a recorded 10,000-record benchmark covering parse/validate/save/export and browser input, with exact hardware/runtime and peak RSS. Use one reference index per pass, stream attachment/archive bytes and enforce limits. Establish an initial baseline and fail measured regressions beyond the documented budget; target control response within 200 ms on the recorded reference machine.
- [ ] Pre-ship candidate builds may explicitly use the already-approved target 1.0.0 with rc.1 for distribution verification while repository VERSION remains 0.0.0. Publishing is separately guarded: committed VERSION must equal the target produced by ship. No testing override may bypass the publication guard. Stable and candidate output bytes are built and tested separately.
- [ ] Package dependency direction remains spec→core→project-fs, with artifacts consuming core. CLI orchestrates renderer payloads and confined export persistence; project-fs does not import CLI or artifacts to render documents. Test import graph cycles and forbidden reverse imports.
