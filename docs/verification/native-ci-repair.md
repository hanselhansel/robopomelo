# Native CI repair checkpoint

Recorded 2026-09-05 against source `184653be40552091454eb75173cc8ad0406c948f`, after the first hosted CI run. This supplements the [local acceptance record](v1-local-acceptance.md); it does not establish a passing release.

## First hosted run

[Run 33950408329](https://github.com/hanselhansel/robopomelo/actions/runs/33950408329) completed with failure. Its browser job and seven macOS matrix jobs succeeded. Source, all Windows and Ubuntu jobs, one macOS job, `required-distribution` and `required-ci` failed. Partial job success does not satisfy the required aggregate.

## Repairs in this source

- Source CI fetches complete comparison history and names `origin/main` for the Changesets check.
- Terminal-driver preparation requires and repairs the spawn helper only on macOS. The native driver remains test-only.
- Runtime launch failures wait for the child process to close before returning, so inherited resources can be released before cleanup.
- Evidence selection pins the initial content hash and rejects later changed bytes even when file metadata stays unchanged. Both inspection and stream consumption have focused regression cases.
- YAML tests normalize existing CRLF before constructing a CRLF fixture.
- Lock acquisition retries when a cooperative owner releases the inspected lock entry during path checks. Root replacement remains rejected and has a separate regression case.

The [storage guide](../project-storage.md) explains how to recover from changed evidence selection. No command, permission or release gate was removed by these repairs.

## Local repair verification

On macOS arm64 with Node 24.20.0, the repaired source passed 599 Vitest tests with two platform-specific skips, 35 Node tooling tests, strict types and the shared source/document/Skill guards. Local V8 line coverage was 77.20%; it does not include separate browser and subprocess acceptance.

The rebuilt candidate passed all nine package-verification checks, including isolated installation and protected HTTP launch. Its local tarball SHA-256 was `ae161964ae2caadde0f1371c361fcbf61d18110df200f0f2dc5dcb4dcb33bb7b`. The actual macOS node-pty run completed five steps, saved, exported a ZIP and exited with code 0. These reports were recorded at 06:47 UTC and do not establish hosted or published artifact results.

## Remaining evidence

[Run 33950895441](https://github.com/hanselhansel/robopomelo/actions/runs/33950895441) was queued for the repaired source at this checkpoint. Its eventual result must be read from the actual run. A later documentation commit requires its own successful required CI before merge.

Full native Windows/Linux acceptance, Windows Chrome/Edge, the repaired hosted aggregate, registry publication and published-artifact acceptance are not claimed here. The [release guide](../releasing.md) still requires the actual candidate and stable native registry matrices before their next release stages. Only manual screen-reader testing has the explicit v1 deferral documented in the local acceptance record.
