# Windows save diagnosis and repair plan

> For agentic workers: execute the approved diagnosis tasks in order, using causal regressions and the existing ship/land release workflow.

**Goal:** Identify and repair the observed Windows save failure, then complete the original release gates.

**Architecture:** Keep transaction and authorization rules unchanged until the failing operation is identified. Expose only closed-list filesystem error codes and operation names in the existing local HTTP error details. Use synthetic projects for native reproduction; never collect real project content or session credentials in diagnostic reports.

**Tech stack:** TypeScript, Node filesystem APIs, Vitest, Playwright, GitHub-hosted Windows runners.

Hansel approved this focused cycle on 2026-09-05 after reviewing the storage-failure follow-up. The first-release target remains 1.0.0-rc.1 followed by 1.0.0. Manual screen-reader testing remains the previously approved unverified exception.

## Diagnosis

- [x] Add `tests/security/filesystem-diagnostics-http.test.ts`: a real local HTTP failure must expose only known `systemCode` and `operation`; arbitrary codes, paths, messages, stacks and credentials must not escape. Confirm the known-code test fails before implementation.
- [x] Update `apps/cli/src/server/errors.ts` with closed-list diagnostics. Preserve status, error code, authentication and mutation semantics. Run the focused security tests and strict types; commit after green.
- [x] Reproduce the captured fictional save through the native Windows transaction path under concurrent source reads; repeat the built browser journey as final acceptance. Preserve the sanitized failure and transaction receipt. A passing run alone is not root-cause proof.

Native reproduction uses `tests/runtime/storage-replay.test.ts` and its synthetic captured fixture. It performs 100 add/remove cycles on Windows under concurrent source observation, captures transaction phase and native method errors, and retains only the synthetic project on failure. The existing native CI matrix runs it. A diagnostic branch/PR may be pushed for this evidence; it must not merge or publish until the causal repair gate is satisfied.

## Repair gate

- [x] Identify the exact failing operation from native evidence. Update this plan with the causal change before editing transaction code. Do not assume a sharing violation or increase assertion deadlines.
- [ ] Write a failing causal regression, implement only the verified correction, and prove successful and failed-operation recovery without weakening source identity, confinement, permissions or approval invalidation.

## Completion

- [ ] Complete the diff-scoped security/release reviews and full required source, browser, native and package checks.
- [ ] Run ship and land-and-deploy, synchronize main, verify the signed candidate and actual published artifacts, configure trusted publishing, promote verified stable, and verify local/live main equality.

Research checked 2026-09-05: [Node system error documentation](https://nodejs.org/api/errors.html) defines stable `code` and `syscall` fields. Error messages are not treated as a machine-readable contract.

## Verified cause and causal change

Native run 33962540784 reproduced EPERM at the source rename on all four Windows Node variants. The transaction phase was evidence-published and the method log identified renameReplace, not lease cleanup. Main remains unchanged while the draft is under repair.

`transactions/replace-source.ts` will retry only Windows EPERM with syscall rename, at most eight attempts. Each attempt rechecks the original staged/destination device and file identity, old/new byte hashes, and identity again after reads. All checks use confined SafeRoot operations. Source changes abort with STALE_BASE; prepared-file changes require recovery. Missing files and other errors abort. There is no unlink, copy-overwrite, permission change, or retry of directory sync/history. The helper remains inside existing authorization and the project lease. Backoff totals at most 775ms; I/O time is separate.

Causal tests cover transient success, bounded persistent failure, other OS/error boundaries, external source edits, stage tampering, changed inode with identical bytes, and post-replacement failure. The existing native replay remains the Windows acceptance gate. Failed synthetic metadata is also retained under a visible artifact directory because upload excludes dot-directories by default.

## Coordination refinement

Native run 33964133472 completed the replay on two Windows versions, but two still exhausted the guarded retries while the observer repeatedly reopened the source. Retry alone is insufficient under continuous managed reads.

Add a per-SafeRoot FIFO file-access coordinator used by buffered `readFile` and `renameReplace` for the same normalized destination. A buffered read keeps its slot through handle close; replacement waits behind it and ahead of later reads. Different paths remain independent, and failures release queued work. Explicit streaming handles retain their existing semantics. This coordinates RoboPomelo's own reads; it does not claim control of external processes. Keep checked retries for external transient denial, all confinement checks and existing authorization/lease ordering.
