# Post-merge verification repair

Evidence recorded on 2026-09-05 against verification source `e9cce681715fa7a4e27771b4a4fb463c34dc785f`. This record does not assert npm publication.

PR #1 passed its full required CI and merged as `7360506342ef175920bcc70210694b46f02c51dd`. Main run `33953698743` subsequently failed two Windows browser jobs. Bootstrap run `33953840519` failed a Windows browser job and Intel macOS 22.22.2 package startup. Signing and publication remained blocked.

## Observed failures and bounded changes

- Windows browser journeys completed but teardown could fail with `EBUSY` while removing their temporary root. The harness awaited the launcher's `exit`, which does not prove inherited streams have closed. A real parent/descendant regression reproduced premature completion. Verification now waits for `close`; Windows teardown targets the live test-owned process tree by PID rather than killing only its parent. Repeated cleanup and cleanup after parent exit are tested. Isolated taskkill exit-race tests require stream closure before accepting a termination error; streams that remain open still fail cleanup.
- In the Windows 22 trace, a patch request took 4,974 ms, then another save remained pending when the navigation assertion's 5-second deadline expired. The acceptance helper now waits up to 15 seconds for the actual destination. It still requires durable saves and the destination's `aria-current` state; the 180-second journey deadline and zero retries remain.
- Intel macOS package verification received a failed launcher envelope before any HTTP checks. The original assertion omitted its error details. The verifier now includes only the failed envelope's errors and command in the assertion, excluding successful bootstrap credentials. The underlying startup failure is not yet diagnosed. Fresh hosted verification must provide the missing evidence.

## Current local evidence

The product suite passed 605 tests with two platform-specific skips. V8 coverage was 77.23% lines, 74.88% statements, 68.09% branches and 69.09% functions. All 43 tooling tests, strict types, dependency boundaries, source limits, documentation links, six Skill contracts and plan-presence checks passed. The affected acceptance and save-recovery journeys passed all six checks across local Chromium, Firefox and WebKit.

At 08:19 UTC, the installed candidate passed all nine package checks on macOS arm64 with Node 24.20.0. Its local tarball SHA-256 was `9c7ac4f0a6f91cdf5d374e3197fe6cb7b9a3beda88f6954d08e48b6f6b4dea02`. Hosted release bytes require their own verification.

These checks do not substitute for Windows, Intel macOS, signed publication or actual registry-install verification. Manual screen-reader testing remains the previously approved, explicitly unverified exception.

## Primary references

Retrieved 2026-09-05:

- [Node child process events](https://github.com/nodejs/node/blob/main/doc/api/child_process.md): `close` follows process termination and closure of child stdio.
- [Microsoft taskkill](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill), updated 2024-11-01: `/pid` selects the process and `/t` includes its children. The verifier uses no image-name wildcard or unrelated PID.

## Consistent CI assertion deadlines

After PR #2, main run `33955697974` failed Windows UI assertions in evidence upload, save completion and project-opening authorization. The candidate run `33955710855` also failed its evidence-upload assertion. None of these failures reported teardown `EBUSY`. The Windows print trace recorded a successful patch response at 4,554 ms; the upload and trust requests were still pending when their default five-second assertions expired.

The CI browser configuration now permits 15 seconds for an assertion to reach its expected state. Local defaults remain five seconds. Every assertion, zero retries, the 60-second test deadline and explicit 180-second complete-journey deadline remain. This is functional acceptance tolerance for hosted execution, not a claim that long interactive latency is desirable or that performance has improved. No runtime deadline, project-write logic or approval rule changes.

[Playwright timeout documentation](https://playwright.dev/docs/test-timeouts), retrieved 2026-09-05, distinguishes assertion timeouts from overall test deadlines. Fresh hosted acceptance remains required; earlier failures are retained as failures.

## Unix verifier process-group ownership

Candidate run `33957358967` passed the proposal journey's functional assertions, then its Linux teardown failed because streams remained open for ten seconds. Main run `33957341201` passed all required checks. Candidate publication remained blocked.

The Unix cleanup escalation previously targeted only the launcher. A deterministic fixture reproduced the same timeout by exiting the launcher while retaining a runtime descendant that ignored SIGTERM and held inherited streams. Test launchers now create their own Unix process group. Normal shutdown still signals the launcher first; bounded escalation can terminate that owned group even after its launcher exits. Windows keeps its PID-scoped taskkill tree behavior. Stream closure remains required before temporary roots are removed. This is verifier containment, not a change to product shutdown or project transaction semantics.

The regression failed before the change and passed after it. All six cleanup tests and strict types passed locally. Fresh hosted verification remains required. The isolation uses [Node's documented detached process-group behavior](https://nodejs.org/api/child_process.html#optionsdetached), retrieved 2026-09-05. Test process-group ownership is explicit at both launch sites; there is no system-wide process search or image-name kill.
