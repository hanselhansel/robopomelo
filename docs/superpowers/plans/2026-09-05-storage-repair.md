# Windows save diagnosis and repair plan

> For agentic workers: execute the approved diagnosis tasks in order, using causal regressions and the existing ship/land release workflow.

**Goal:** Identify and repair the observed Windows save failure, then complete the original release gates.

**Architecture:** Keep transaction and authorization rules unchanged until the failing operation is identified. Expose only closed-list filesystem error codes and operation names in the existing local HTTP error details. Use synthetic projects for native reproduction; never collect real project content or session credentials in diagnostic reports.

**Tech stack:** TypeScript, Node filesystem APIs, Vitest, Playwright, GitHub-hosted Windows runners.

Hansel approved this focused cycle on 2026-09-05 after reviewing the storage-failure follow-up. The first-release target remains 1.0.0-rc.1 followed by 1.0.0. Manual screen-reader testing remains the previously approved unverified exception.

## Diagnosis

- [x] Add `tests/security/filesystem-diagnostics-http.test.ts`: a real local HTTP failure must expose only known `systemCode` and `operation`; arbitrary codes, paths, messages, stacks and credentials must not escape. Confirm the known-code test fails before implementation.
- [x] Update `apps/cli/src/server/errors.ts` with closed-list diagnostics. Preserve status, error code, authentication and mutation semantics. Run the focused security tests and strict types; commit after green.
- [ ] Reproduce the fictional save on native Windows with the built browser acceptance journey. Preserve the sanitized failure and transaction receipt. A passing run alone is not root-cause proof.

Native reproduction uses `tests/runtime/storage-replay.test.ts` and its synthetic captured fixture. It performs 100 add/remove cycles on Windows under concurrent source observation, captures transaction phase and native method errors, and retains only the synthetic project on failure. The existing native CI matrix runs it. A diagnostic branch/PR may be pushed for this evidence; it must not merge or publish until the causal repair gate is satisfied.

## Repair gate

- [ ] Identify the exact failing operation from native evidence. Update this plan with the causal change before editing transaction code. Do not assume a sharing violation or increase assertion deadlines.
- [ ] Write a failing causal regression, implement only the verified correction, and prove successful and failed-operation recovery without weakening source identity, confinement, permissions or approval invalidation.

## Completion

- [ ] Complete the diff-scoped security/release reviews and full required source, browser, native and package checks.
- [ ] Run ship and land-and-deploy, synchronize main, verify the signed candidate and actual published artifacts, configure trusted publishing, promote verified stable, and verify local/live main equality.

Research checked 2026-09-05: [Node system error documentation](https://nodejs.org/api/errors.html) defines stable `code` and `syscall` fields. Error messages are not treated as a machine-readable contract.
