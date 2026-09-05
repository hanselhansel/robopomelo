# Launcher startup diagnosis and repair plan

**Goal:** Resolve the Intel macOS packaged startup failure while preserving exact runtime identity verification, then finish the existing release gates.

**Architecture:** Keep version, protocol and complete-manifest checks unchanged. Separate failure stages using bounded diagnostic values. Measure actual packaged child startup on native Intel runners. Adjust only the verified cause, retaining finite startup and cleanup budgets and withholding project arguments, working directory and stdin until identity confirmation.

Hansel approved this focused cycle on 2026-09-05. Windows storage acceptance has passed; full CI is blocked by Intel macOS Node 24.15.0 `RUNTIME_HANDSHAKE`. The old message does not distinguish timeout, invalid identity or child exit.

- [x] Add causal diagnostic tests for invalid identity, timeout and child exit, proving project data is never supplied on rejection.
- [x] Add bounded stage/timing diagnostics in `apps/cli/src/runtime/launcher.ts`, preserving current error codes and validation.
- [ ] Measure real packaged startup on native Intel macOS, using the same production identity validation and a finite diagnostic deadline. Preserve results and original failures.
- [ ] Correct the verified cause, with slow-valid, wrong-identity, timeout and child-failure regressions as applicable. Align outer verifier deadlines if the handshake budget changes.
- [ ] Complete source/security/browser/native/package gates, then ship/land, signed candidate and published-artifact verification, trusted publishing, stable promotion and local/live main reconciliation.

No merge or publication while required CI fails. Keep the approved first-release target and manual screen-reader exception unchanged. Node child-process lifecycle documentation was checked on 2026-09-05: https://nodejs.org/api/child_process.html.

The native Intel profile invokes the same production launcher on the built runtime for version-only commands in an isolated temporary directory. It permits 30 seconds diagnostically, records fork-to-identity timing, and fails its gate when a verified identity arrives beyond the unchanged production default. It never treats the extended diagnostic deadline as passing production acceptance.
