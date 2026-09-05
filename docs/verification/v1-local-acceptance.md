# V1 local acceptance evidence

Recorded 2026-09-05 against product source `374f1235f2389e94c91c59ddfafec9e1084b922b`. This record establishes local results, not hosted CI, registry publication or customer validation.

## Verified locally

- Node 24.20.0 on macOS arm64: 588 Vitest source tests passed, with two platform-specific skips; 25 Node tooling tests passed. Strict types, dependency boundaries, source-size limits, documentation links, six Skill contracts and plan-coverage presence checks passed.
- Current V8 source coverage: 77.10% lines, 74.72% statements, 67.97% branches and 68.99% functions. Browser and subprocess execution provide separate evidence; these percentages do not measure that execution.
- The full packaged browser run passed 22 cases and exposed one proposal-refresh defect in all three engines. After repair, all 12 affected cases passed: proposal application, external-source inspection, pending-input preservation and failed-save recovery in Chromium, Firefox and WebKit. Two PDF tests are intentionally skipped outside Chromium.
- The unchanged blank-project journey passed in all three engines: five authored steps, engineering answers, supplied operator review, approval invalidation after a material change and exact portable export. The all-screen workflow includes evidence upload, selected-attachment ZIP download, accessibility checks and no outbound browser requests.
- Native Safari 26.6.2 passed all eleven screens in the earlier acceptance run. The repaired proposal flow was then checked again in native Safari: exact proposal applied, Saved displayed, pending list cleared, final name and source revision matched actual YAML, and no false external-source notice remained.
- The real macOS terminal completed all five steps, a durable edit, ZIP export and clean exit through node-pty 1.1.0. The driver is a development dependency excluded from the public runtime.
- A4 and US Letter PDF outputs were generated and visually inspected. Complete records, findings and source identity remain in print despite screen filtering or pagination.
- The rebuilt `1.0.0-rc.1` tarball passed manifest inventory, packed inventory, isolated installation, npm bin execution, offline version, example creation, validation, seven-artifact export and protected HTTP launch. Local tarball SHA-256: `66f56e4849166b960dbbf188f7232ce64758fc519ed3e9cacb9ad61484fb2372`. Hosted release bytes will be built and verified separately.

The release-owned review resolved eleven specialist findings. A subsequent browser regression led to one explicitly authorized additional focused repair cycle. Commit `374f123` reconciles a successful proposal response directly, preserves newer input, rejects overlapping writes and retains the external-source refresh guard. Its focused static review found no further issue. No unavailable cross-model review is counted as completed.

## Explicitly deferred manual test

Hansel approved deferring manual screen-reader testing for v1 on 2026-09-05. VoiceOver started through System Settings and produced process/audio-pipeline activity, but the available automation could not observe intelligible output, captions or actual reader navigation. Keyboard shortcuts and tutorial activation were also attempted. VoiceOver and changed test state were restored afterward.

Screen-reader usability remains **unverified**. This is not a passing screen-reader result or a WCAG-conformance claim. Automated accessibility, keyboard, browser, package, CI and publication gates remain required. The P1 follow-up in [TODOS.md](../../TODOS.md) defines completion evidence.

## Ordered release evidence still required

Before merge, require actual passing hosted CI and strict enforcement of its `required-ci` aggregate. The configured 16-leg native matrix and Windows Chrome/Edge checks are not native-platform evidence until they execute.

After merge, verify the original signed candidate bytes, real npm publication, publisher identity, installed candidate behavior, exact trusted-publisher configuration, stable artifact, guarded latest promotion and fresh registry installation. Reconcile canonical local main against live GitHub main. None of those outcomes is claimed by this local record.

Native activation in individual LLM hosts is also unverified. Six Skill contracts and deterministic CLI replays establish the ordinary-file/CLI path only. No actual practitioner discovery results, executed robot tests, simulator runs, physical safety or deployment performance are claimed.

See [CI contract](ci-contract.md), [package and benchmark evidence](2026-09-05-local.md), and [approved delivery plan](../superpowers/plans/robopomelo-delivery.md).
