# RoboPomelo Persistence, Server, and Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The coordinator reconciles these proposed internal APIs with the core plan before implementation. No additional agents are required by this plan.

**Goal:** Make the complete v1 reliable on macOS, native Windows, and Linux through confined portable storage, recoverable transactions, a protected loopback server, and verified managed-runtime updates.

**Architecture:** `project-fs` owns the only project mutation boundary and supplies observations to the deterministic core. The server and CLI use the same session service, while the launcher manages machine-local runtime caches independently of project locks. A confined filesystem adapter revalidates paths at operation time, rejects escaping links and checks opened-file identity. Its boundary covers malicious project data and HTTP requests, with documented limits against concurrent unrestricted same-user filesystem replacement.

**Tech Stack:** TypeScript, supported Node 22/24, `yaml` document AST, Node crypto/HTTP/streams, Vitest, `semver`, npm/Sigstore verification libraries, and streamed archive tooling. Pin exact library versions after the coordinator's primary-source and dependency review; do not implement cryptography or a YAML parser.

---

## Inputs, authority, research, and scope

Normative inputs are `AGENTS.md` and all six approved design documents, particularly `runtime-security-updates.md` and `specification-and-validation.md`. This is the bounded runtime subsection of the Deep implementation plan. The parent owns current web research and the global query budget; no independent web queries were performed for this document. Primary sources opened under the parent's existing research budget on 2026-09-05: [npm audit signatures](https://docs.npmjs.com/cli/v11/commands/npm-audit/) documents signature/provenance verification and verified attestation output; [npm provenance](https://github.com/npm/provenance) describes source identity verification; [Node filesystem documentation](https://nodejs.org/docs/latest-v24.x/api/fs.html) documents file-open flags and platform differences. Parent also supplied [Sigstore JavaScript verification](https://docs.sigstore.dev/language_clients/javascript/) and [current sigstore package engines](https://www.npmjs.com/package/sigstore), retrieved 2026-09-05, supporting a bundled verifier with the actual package Node minimum. These support the choices below; they do not establish stronger cross-platform race guarantees.

All specified v1 runtime features remain required. Native Windows validation coverage and npm publication credentials can be material release dependencies. A timeout value, module split, cache-directory naming choice, or conservative denial of an unusual filesystem type is a routine choice. Do not silently replace verified provenance with a checksum, durable transactions with rename alone, or confinement with `path.resolve`.

This implementation does not constrain a hostile process with unrestricted shell access that can replace the app, modify machine settings, or directly change project files. Its own filesystem operations must nevertheless resist untrusted project paths and substitution races. These are different claims.

## Dependency graph and integration contracts

```text
spec types/schema -> pure core validation/patch/projection
                             |
                     project-fs AST codec
                             |
SafeFs + LockProvider -> transaction/recovery/history -> ProjectSession
                             |                         /      \
                         evidence                 CLI/wizard  HTTP -> web
                             |
                      artifact observations -> artifacts -> export stream

machine paths -> settings/trust
machine paths -> launcher lock -> release verifier -> version cache -> child runtime
```

`artifacts` owns document generation. `project-fs` owns path allocation, attachment reads, exact source snapshots, and output persistence. The server never interprets domain rules independently. The launcher receives only a small compatibility probe result and never sends project information to the registry.

Proposed types for `packages/project-fs/src/contracts.ts`:

```ts
import type { Actor, Deployment, Id, Mutation, PatchEnvelope, Scope } from '@robopomelo/spec';
import type { EvidenceObservation, FieldDiff, ProjectSnapshot } from '@robopomelo/core';
export type SourceIdentity = Pick<ProjectSnapshot, 'sourceRevision' | 'sourceHash'>;
export type RootIdentity = { canonicalPath: string; device: string; fileId: string };
export type KnowledgeProblem = { code: string; message: string; line?: number; column?: number };
export type OpenResult =
  | { kind: 'readable'; snapshot: ProjectSnapshot; externalEdit: boolean }
  | { kind: 'inspection'; rawText: string; problems: KnowledgeProblem[]; lastReadable?: SourceIdentity };
export type Authorization = { grantId: string; generation: number; scopes: Scope[] };
export type CommitInput = {
  expected: SourceIdentity; idempotencyKey: string; authorization: Authorization;
  actor: Actor; mutation: Mutation; approvedPatchDigest?: string;
};
export type CommitResult =
  | { kind: 'committed'; snapshot: ProjectSnapshot; diff: FieldDiff[] }
  | { kind: 'proposal'; proposalId: Id; patchDigest: string; diff: FieldDiff[] }
  | { kind: 'conflict'; expected: SourceIdentity; current: SourceIdentity; proposedDiff: FieldDiff[] };
```

Parent-owned contracts: `Deployment`, `PatchEnvelope`, `ReviewCommand`, `Mutation`, `FieldDiff[]`, `ValidationReport`, `evaluatePatch(deployment, PatchEnvelope, PatchContext) -> {deployment, diff, validation, invalidatedApprovalIds}`, `validateDeployment(input, ValidationContext) -> ValidationReport`, and `planningHash(deployment) -> string`. `ProjectSnapshot` exposes `deployment`, `sourceRevision`, `sourceHash`, `planningHash`, `validation`, and `approvalStatus`. Use the shared `sourceRevision` name at every runtime boundary; map it to `deployment.meta.revisionId` only when accessing the YAML model. Exact interfaces live in `robopomelo-contracts.md`. Deserialize untrusted request data as `unknown` and validate it before it becomes one of these shared typed inputs. Core accepts facts and operation scopes, never reads files or local grants. Both expected revision and exact byte hash are compared under the write lock. Parent core handles approval invalidation and protected fields. The transaction dispatches Mutation.kind to evaluatePatch or evaluateReview; runtime code never edits review arrays directly.

`ProjectSession` methods are `open()`, `inspect()`, `commit(input)`, `reconcileExternal(expectedHash, actor)`, `observeEvidence(ids)`, `addEvidence(selection, input)`, `mutationStatus(id,digest)`, `historyList()`, `historyRead(revision)`, `restore(revision, input)`, `export(selection)`, and `migrate(target, input)`. Each mutation uses one `transaction()` implementation. `close()` releases owned handles and watchers, never another process's lock.

## Files to create

| Files | Single responsibility |
| --- | --- |
| `packages/project-fs/src/{contracts,errors,limits,index}.ts` | Typed boundary, safe public errors, trusted limits, explicit exports |
| `packages/project-fs/src/yaml/{parse,edit,serialize}.ts` | Safe AST input, stable-ID patch application, preserving serialization |
| `packages/project-fs/src/fs/{paths,safe-fs,lock,owner,machine-paths}.ts` | Portable relative names, handle contract, locking, process identity, machine locations |
| `packages/project-fs/src/transactions/{journal,prepare,commit,recover}.ts` | Versioned intent log, staging, source replacement, deterministic recovery |
| `packages/project-fs/src/{session,external-edits,history,migrate}.ts` | Session composition, reconciliation, history/restore, backup migration |
| `packages/project-fs/src/evidence/{selection,copy,observe,remove}.ts` | Explicit external file handles, bounded copies, observations, reference removal |
| `packages/project-fs/src/settings/{store,trust,updates}.ts` | Atomic machine config, authority grants, update preferences |
| `apps/cli/src/server/{start,security,bootstrap,router,project-routes,evidence-routes,export-routes,assets}.ts` | HTTP lifecycle, headers, one-time browser session, typed routes, local assets |
| `apps/cli/src/runtime/{selection,launcher,compatibility,manifest,download,verify,extract,cache,update,rollback}.ts` | Exact runtime binding and update pipeline |
| `apps/cli/src/runtime/{policy,network,settings}.ts` | Eligibility, allowed metadata traffic, machine settings facade |
| `apps/cli/src/commands/{trust,update,doctor}.ts` | Complete terminal commands, also consumed by wizard bindings |
| `tests/runtime/`, `tests/security/`, `tests/distribution/` | Behavior, attack fixtures, actual packed launcher checks |
| `docs/{project-storage,offline-operation,update-policy,security-boundaries}.md` | User-visible operating contracts and recovery instructions |

Keep every source file below 400 lines. Normal packaged installation requires no compiler, native-helper download, Docker, or architecture-specific runtime binary beyond supported Node. Native filesystem bindings are not part of this plan; stronger hostile same-user confinement would require separate scope review.

## Task 1: preserving data-only YAML and explicit input limits

**Files:** Create the three `yaml/` modules, `limits.ts`, `tests/runtime/yaml.test.ts`, and `tests/runtime/fixtures/commented-deployment.yaml`. The fixture is a complete schema-valid Deployment with one existing root `extensions` mapping, its preceding `# vendor note`, and `acme` value `{code: "001", flag: false}`; `fixtures.commentedSource` reads its exact bytes. Do not append a second extensions key to an existing root.

- [ ] Write this failing regression with the complete fixture `fixtures.commentedSource`:

```ts
it('preserves unrelated comments and extension scalars when changing a title', () => {
  const text = fixtures.commentedSource;
  const document = parseSource(text);
  const changed = editRecord(document, { collection: 'needs', id: 'need-1', field: 'title', value: 'Safe handoff' });
  const rendered = serializeSource(changed);
  expect(rendered).toContain('# vendor note');
  expect(parseSource(rendered).value.extensions.acme).toEqual({ code: '001', flag: false });
});
it.each(['x: 1\nx: 2', 'x: &a [1]\ny: *a', 'x: !execute echo', 'x: {<<: {y: 1}}'])('rejects unsafe YAML %s', text => {
  expect(() => parseSource(text)).toThrow();
});
```

- [ ] Run `npx vitest run tests/runtime/yaml.test.ts`; expect missing-module failures before implementation.
- [ ] Implement `parseSource(bytes)` using the `yaml` package `parseDocument`, YAML 1.2 core schema, unique keys, source tokens, strict parsing, no custom tags or merge handling. Visit AST nodes before converting to JSON: reject aliases, anchors, explicit non-core tags, `<<` merge keys, non-string map keys, duplicate keys, non-finite numbers, dangerous prototype keys, more than 64 nested containers or 10,000 domain records. Bound raw bytes to 8 MiB before parsing. Return parser line/column diagnostics. Preserve false, decimal strings, zero, and explicit null exactly as schema semantics require.
- [ ] Implement stable-ID AST editing rather than rebuilding the root object. Edit only targeted nodes. Removing a node with comments must move its comments to a surviving adjacent node or raise a structured preservation conflict; it cannot silently discard them. Serialize, reparse, and compare resulting semantic values with the core-approved patch result before allowing a commit.
- [ ] Add tests for comments on removed records, anchors declared but unused, deeply nested extensions, UTF-8 limits, quoted numeric strings, prototype keys, malformed external YAML, and CRLF inputs. Source hash uses actual serialized bytes; preserved comments affect source hash, not the planning projection.
- [ ] Run the focused test, root typecheck, and boundary check; expect all pass. Stage the named modules and test, then `git commit -m 'feat: preserve safe YAML source edits'`.

## Task 2: operation-time confinement and portable paths

**Files:** Create `fs/paths.ts`, `fs/safe-fs.ts`, and `tests/security/confinement.test.ts`.

- [ ] Write attack tests before implementing file access:

```ts
it.each(['../secret', '/etc/passwd', 'C:\\secret', '\\\\host\\share', 'x/../y', 'x\\..\\y', 'file:stream', 'CON', 'x.'])('rejects %s', value => {
  expect(() => projectRelativePath(value)).toThrow();
});
it('rejects an ancestor replaced with an escaping link before use', async () => {
  const root = await fixtureRoot();
  await root.replaceAncestorBeforeOperation('evidence', outsideSecretDirectory);
  await expect(root.fs.readFile('evidence/secret.txt')).rejects.toMatchObject({ code: 'PATH_ESCAPE' });
  expect(await outsideReadAudit()).toEqual([]);
});
```

- [ ] Run `npx vitest run tests/security/confinement.test.ts`; expect failure or missing safe filesystem implementation.
- [ ] Define `SafeRoot`: `identity()`, `readFile(relative, limit)`, `openRead(relative)`, `createExclusive(relative)`, `mkdir(relative)`, `renameReplace(staged, destination)`, `renameNoReplace(from,to)`, `stat(relative)`, `list(relative)`, `fsyncDirectory(relative)`, and `close()`. Return opaque open handles, never raw paths for downstream reopening. `ProjectRelativePath` is a branded validated value. Segments reject absolute/drive-relative/UNC/device prefixes, both separator forms, dot segments, NUL, alternate streams, reserved Windows basenames, trailing dots/spaces, and portable case-collision destinations.
- [ ] Implement the adapter with Node filesystem primitives. Validate relative segments, `lstat` every ancestor, reject managed symbolic links/junctions, resolve the parent and compare it against the pinned canonical root at operation time. Open final files with exclusive creation for writes and `O_NOFOLLOW` where supported for reads; compare `fstat` identity with the inspected file, then recheck ancestor/root identity before returning a handle. On Windows explicitly test `lstat`/`realpath` handling of junctions/reparse escapes rather than assuming POSIX flags exist. Never truncate existing hardlinked files. New managed files get generated names and atomic replacement. The HTTP API cannot create links, rename arbitrary directories or choose unrestricted paths, so it cannot induce ancestor-swap races using permitted operations.
- [ ] Document the exact residual: an unrestricted same-user process can race an ancestor replacement between Node path checks and open, and JavaScript checks cannot promise kernel-enforced beneath-root access in that scenario. Do not claim the test above proves hostile concurrent sandboxing. A descriptor-relative helper would address that additional guarantee but is not approved implementation scope. Raise any real in-scope route that can induce directory substitution during autoplan; such a route must be removed or bounded.
- [ ] Keep original project root identity pinned for a session. Reject root replacement and unsupported network/filesystem semantics with a precise error. Admit a user-selected canonical root only once; reject managed symlinks, including links pointing inside the root, as a routine conservative policy. Do not follow links while exporting, copying history, migrating, or loading assets from project folders.
- [ ] Run tests on native Windows with a real junction fixture, POSIX symlinks, hardlink-sensitive write cases, case-insensitive collisions, parent swaps, final-file swaps, and root replacement. Writes use a new exclusively-created file then rename; never truncate a user-controlled existing inode. Run filesystem smoke tests in each supported native operating-system CI job.
- [ ] Verify `npx vitest run tests/security/confinement.test.ts`, typecheck, source-line limits and the native-OS CI matrix, then commit `feat: validate confined project paths at each filesystem operation`.

## Task 3: per-project locks and deterministic transaction recovery

**Files:** Create `fs/{lock,owner}.ts`, four `transactions/` modules, and `tests/runtime/{locking,recovery}.test.ts`.

- [ ] Write failure-injection and real-process tests:

```ts
it.each(['journal-flushed', 'evidence-staged', 'snapshot-flushed', 'source-replaced', 'history-complete'])('recovers after %s', async point => {
  const project = await transactionFixture();
  await project.crashWriterAt(point);
  const recovered = await project.reopen();
  expect(['old-hash', 'new-hash']).toContain(recovered.snapshot.sourceHash);
  expect(await project.allReferencedEvidenceExists()).toBe(true);
  expect(await project.verifyHistoryChain()).toEqual([]);
});
it('serializes two OS processes and rejects a stale writer', async () => {
  const results = await raceTwoChildWriters(await transactionFixture());
  expect(results.map(r => r.kind).sort()).toEqual(['committed', 'conflict']);
});
```

- [ ] Run `npx vitest run tests/runtime/locking.test.ts tests/runtime/recovery.test.ts`; expect missing lock/transaction implementation.
- [ ] Implement cooperative exclusive lock directories with `mkdir`, an owner record created with `wx`, a cryptographic nonce, PID, process-start marker where available, hostname/boot identity, and pinned root identity. Contenders treat a live PID, permission-denied liveness probe, foreign host, malformed/missing owner, or uncertain identity as locked. Age/heartbeat never proves staleness. A provably absent same-host PID permits attempted stale recovery under a separate exclusive recovery-claim directory. After that claim, re-read nonce/root/file identity and liveness, rename only the matching stale directory to a generated quarantine name, then release the recovery claim. All normal acquisition paths check the recovery claim before and after creating a lock and back out if it changed. Releasing checks owned nonce and root identity and never removes another owner. A crash while ownership/recovery records are incomplete returns conservative inspection guidance, not guessed lock theft. Require real competing-process tests, including stale recovery versus a fresh acquirer. Network-shared folders with unverifiable host liveness cannot use automatic stale recovery.
- [ ] Define `Journal` with format version, transaction ID, prior/new byte hashes, prior/new revision IDs, patch digest, idempotency key, actor/provenance, evidence-addition descriptors, snapshot paths, and `prepared|committed` phase. All paths are generated project-relative values, never trusted directly on journal load. Integrity-check journals and source snapshots before recovery. Validate journal schemas and resource limits because project history is untrusted too.
- [ ] Implement prepare under lock: re-read source and grants, reject stale expected identities, run core patch validation, serialize preserving AST, stage bytes/evidence/history under one transaction directory on the same filesystem, flush staged files, and persist/flush the prepared journal. Check sufficient space and permission before source replacement. Recheck authorization generation immediately before commit.
- [ ] Implement commit: source atomic replacement is the commit point; flush the containing directory where supported; finalize immutable history metadata, mark committed, and release owned lock. Windows replacement uses supported same-filesystem rename/replace behavior and bounded retry for sharing violations, never delete-then-write. Unsupported durability guarantees must be documented and tested, without claiming power-loss guarantees unavailable from the filesystem.
- [ ] Recovery under the same lock compares actual source bytes to journal hashes. New hash means finalize the valid staged transaction; old hash means preserve old source and retain staged recovery material; neither hash means preserve both journal candidates and the external source in inspection state. Missing required staging data cannot be guessed from timestamps. Recovery must not overwrite an unrelated external edit. Completed idempotency keys return the original result; a reused key with another patch digest fails.
- [ ] Add tests for revocation while queued, disk-full before/after source rename, damaged journals, unknown source hashes, interrupted evidence copy, PID reuse diagnostics, lock holder crash, history tampering, and retry idempotency. Verify focused tests and the native-OS matrix, then commit `feat: recover project transactions across crashes and concurrent writers`.

## Task 4: history, external edits, evidence, migrations and export storage

**Files:** Create `session.ts`, `external-edits.ts`, `history.ts`, `migrate.ts`, four `evidence/` modules, and `tests/runtime/{history,evidence,migrations}.test.ts`.

- [ ] Write regression tests:

```ts
it('preserves invalid external YAML and pending browser changes', async () => {
  const p = await projectFixture();
  const pending = p.patchFromCurrent();
  await p.externalWrite('project: [');
  expect((await p.session.open()).kind).toBe('inspection');
  await expect(p.session.commit(pending)).rejects.toMatchObject({ code: 'SOURCE_UNREADABLE' });
  expect(await p.sourceBytes()).toEqual(Buffer.from('project: ['));
});
it('restores as a new revision without deleting later evidence', async () => {
  const p = await historyWithEvidenceFixture();
  const restored = await p.restoreOldRevision();
  expect(restored.snapshot.sourceRevision).not.toBe(p.oldRevision);
  expect(await p.readHistoricalEvidence()).toEqual(p.originalEvidenceBytes);
});
```

- [ ] Run the three test files; expect missing composition/history behavior.
- [ ] `FileSelection` is an explicit bounded external-source capability holding an open read handle and display basename. CLI creates it only from an explicit `evidence add <source>` argument; browser uploads bytes using an explicit file picker instead of sending arbitrary server paths. Copy through a byte-counting SHA-256 stream, enforce 256 MiB per attachment, use generated unique evidence paths, and compare source metadata before/after copy to detect changes. Do not infer MIME safety from extension.
- [ ] Evidence observation returns only availability and hashes. Missing future-acceptance result attachments are not invented and do not become required planning observations. Removal updates active references through the core while retaining historical evidence. Downloads set attachment disposition and `nosniff`; never render HTML, SVG, PDF scripts or office files under the application origin.
- [ ] Watchers debounce notifications and supplement them with a read/hash check on every operation. They never mutate source. Explicit reconciliation snapshots valid external bytes with external provenance, creates a fresh revision through AST edit, revalidates references and approval binding, and preserves the original raw external snapshot. Invalid external data remains recoverable inspection state. No implicit stale-patch rebase in v1; emit a structured conflict and keep pending browser data available in memory for download.
- [ ] History index is a rebuildable cache of immutable revision records. `restore` checks evidence availability and supported schema, computes a full authoring-state diff against current state, preserves all current review records/revocations and current-approval selection, enforces protected-field authority, creates a new revision through the normal transaction, and reruns core approval validity. It must not resurrect a revoked approval or remove a later protected obligation under author-only authority. History filenames are IDs generated by the application and constrained again at read time.
- [ ] Migrations require explicit target and authority. Build a complete confined restorable backup of source, history and evidence before modification; exclude the growing backup itself and reproducible exports, recording those exclusions. Verify source/evidence hashes in its manifest; validate migration output and extension preservation. If backup or migration fails, keep current source untouched. Export gets a frozen source/evidence observation under a read snapshot, uses 2 GiB selected-payload limit, streams archive bytes, and aborts if selected evidence changes while streaming. Partial output gets an incomplete temporary name and cannot be reported as final.
- [ ] Verify focused tests, artifacts integration fixtures, and cross-platform copy/restore/export runs. Commit `feat: preserve evidence and reconcile portable project history`.

## Task 5: machine-local settings and revocable project trust

**Files:** Create `fs/machine-paths.ts`, three `settings/` modules, CLI trust command, and `tests/security/trust.test.ts`.

- [ ] Write the cross-project authorization test:

```ts
it('does not trust a copied project even with the same project ID', async () => {
  const p = await trustedFixture();
  const copy = await p.copyElsewhere();
  expect(await p.trust.lookup(copy.identity)).toBeUndefined();
});
it('honors revocation immediately before source replacement', async () => {
  const p = await trustedFixture();
  await p.pauseCommitBeforeReplace();
  await p.trust.revoke(p.grantId);
  await expect(p.resumeCommit()).rejects.toMatchObject({ code: 'GRANT_REVOKED' });
});
```

- [ ] Run `npx vitest run tests/security/trust.test.ts`; expect no working trust service.
- [ ] Store config under OS-native user config/data locations, with an injectable test root. Use a mature narrow path helper such as `env-paths` if its output matches macOS/Windows/Linux conventions; no project catalogue or project data outside portable folders. Protect files with owner-only POSIX modes and user-scoped Windows directories, validate schema, reject config links, and use atomic lock/replace writes. All config version changes preserve a recoverable previous file.
- [ ] Bind grants to canonical root path, native root file identity, project ID, scopes, mode, generation, and granted/revoked dates. A move, copy, replaced directory, different project ID, or invalid settings causes reevaluation. A user directly editing machine settings remains outside strong enforcement. Authoring/evidence/export grants are distinct from `record-decisions`/`manage-settings` authority. Imported YAML cannot contain effective grants or increase limits.
- [ ] `trust grant` supports explicit noninteractive scopes and mode, `trust show` returns asserted scope and status, `trust revoke` increments a generation/tombstone; Forget removes remembered trust without deleting project contents. Settings and project mutation locks acquire a fixed order to prevent deadlock; acquire the project lock before the short machine-settings lock used for final authorization/source replacement; settings-only operations never acquire a project lock. Hold that settings lock across the final generation check and source replacement so a completed revocation cannot race past the check. CLI per-run authorization is explicit, bounded, and never persists unless requested.
- [ ] Verify copied-project, same-path replacement, queued revocation, malformed config, Windows path case, and settings crash tests; commit `feat: remember and revoke machine-local project authority`.

## Task 6: loopback server, session bootstrap and complete API

**Files:** Create nine server modules and `tests/security/{http,uploads,markdown}.test.ts`.

- [ ] Write actual HTTP attack tests:

```ts
it('rejects cross-origin reads and forged mutation tokens', async () => {
  const server = await localServerFixture();
  expect((await fetch(server.url + '/api/project', { headers: { Origin: 'https://evil.test' } })).status).toBe(403);
  expect((await fetch(server.url + '/api/patch', { method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json', 'X-RP-CSRF': 'wrong' }, body: '{}' })).status).toBe(403);
});
it('does not interpret a JSON path as a host-file capability', async () => {
  const server = await authenticatedFixture();
  expect((await server.post('/api/evidence', { path: '/etc/passwd' })).status).toBe(400);
});
```

- [ ] Run `npx vitest run tests/security/http.test.ts tests/security/uploads.test.ts tests/security/markdown.test.ts`; expect missing server.
- [ ] Bind Node HTTP server to `{host:'127.0.0.1', port:0}` only. Strictly accept Host equal to the bound loopback host and actual port. Do not honor proxy headers. Deny foreign Origin on reads and writes; authenticated read APIs also require a session credential so a local unauthenticated process cannot just omit Origin. CLI uses direct session APIs rather than bypassing browser protection over HTTP.
- [ ] Launch browser with a cryptographically random, short-lived, single-use secret in the URL fragment, never query parameters. Bootstrap exchanges it in a POST request body after exact Origin/Host checks, clears the fragment with `history.replaceState`, returns a session credential and independent CSRF token stored in tab-scoped `sessionStorage` for refresh continuity, and invalidates the secret. Avoid loopback cookies because cookies are not port-scoped. Require credential plus CSRF header on mutations, no CORS headers, JSON content type on JSON routes, and reject cross-site Fetch Metadata when supplied. Redact bootstrap/session tokens from logs and errors. Refresh restores the tab session while this server process is alive; browser restart/server restart requires a fresh bootstrap. Strict CSP, sanitized rendering and no third-party scripts reduce token exposure, but XSS could still access browser-held credentials. Do not weaken auth to make bookmarked old URLs work.
- [ ] Bundle assets and use CSP `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. Add no-store to API and sensitive documents, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and frame denial. Use plain React text by default; artifact Markdown renders through a strict sanitizer with remote images, embedded HTML and executable URLs disabled. HTTP errors return codes and field diagnostics without host filesystem paths or stack traces.
- [ ] Implement typed routes for open/create/example selection, source inspection, all five-step mutations, readiness/traceability, proposals, evidence list/upload/remove/check, history list/read/restore, review actions, export streaming, trust and update settings. A server session owns one active `ProjectSession`; project switch requires explicit intent and root selection, closes old handles, rotates session project epoch, and rejects outstanding requests from the previous project. Welcome root selection uses an explicit local directory chooser or a separately authorized root-selection form; ordinary project APIs cannot accept a fresh arbitrary root.
- [ ] Enforce 8 MiB ordinary request bodies before buffering, schema depth/record limits, bounded upload streaming, one outstanding writer per project lock, abort cleanup, request/header timeouts, and export limit. Return structured `409` conflicts, `413` size errors, `403` scope errors and `422` safe parser/schema diagnostics. Do not put project secrets into access logs. `SIGINT`/`SIGTERM` closes HTTP intake then awaits or safely journals outstanding writes.
- [ ] Verify real-browser bootstrap, refresh, project switch, CSRF, DNS rebinding Host, Origin-less unauthorized read, upload abort, oversized request, malicious Markdown, remote resource blocking and shutdown tests. Commit `feat: serve the protected local project workspace`.

## Task 7: exact runtime selection and an independently locked cache

**Files:** Create runtime selection, launcher, cache, policy, compatibility and settings modules, and `tests/distribution/launcher.test.ts`.

- [ ] Write policy tests:

```ts
it('uses only the explicitly pinned runtime while offline', async () => {
  const host = await launcherFixture({ cached: ['1.0.0', '1.1.0'], pin: '1.0.0', offline: true });
  await host.launch();
  expect(host.executedVersion).toBe('1.0.0');
  expect(host.networkRequests).toEqual([]);
});
it('keeps a running session on its original exact runtime', async () => {
  const host = await launcherFixture({ cached: ['1.0.0'] });
  const session = await host.launch();
  await host.stageVerified('1.1.0');
  expect(session.version).toBe('1.0.0');
});
```

- [ ] Run `npx vitest run tests/distribution/launcher.test.ts`; expect missing launcher.
- [ ] The public package contains a small stable launcher and bundled matching runtime. Managed runtime cache has immutable version/digest directories and an atomically replaced selection pointer; separate OS lock protects promotion. Never rewrite a global npm installation, npx cache, or source checkout. Bootstrap with the bundled installed runtime if no verified cache exists. The release contains all runtime dependencies ; execute no install lifecycle scripts during runtime staging.
- [ ] Resolve flags before network work: offline/off/pin are authoritative, source-checkout execution disables managed updates unless explicitly requested, and scripted commands bind once without mid-command replacement. Document runtime pin separately from `npx robopomelo@package-version`. A pinned runtime unavailable locally while offline returns a precise error without downloading or selecting a different version.
- [ ] Compatibility uses verified release manifest ranges for app major, spec, Node, OS/arch, launcher protocol, rule set and migration requirements. Before opening a known project, perform a read-only bounded spec-version probe without loading project code. When opening from Welcome, select only a runtime that declares all supported v1 spec ranges without automatic migration; explicitly handle incompatible later project selection. Keep a first-launch setting and pending update visible, not a hidden upgrade.
- [ ] Automatic startup checks use bounded timeouts and fall back to a verified usable runtime on timeout/error. Promote only before starting the session; pending updates wait for next launch. A child runtime handshake proves exact version and asset/Skill manifest completeness before project data is supplied. Surface child failure and retain previous selection.
- [ ] Verify two concurrent launches, source checkout, non-TTY command, pin mismatch, missing cache, older launcher protocol, absent bundled asset, active-session update and crash-at-pointer-replace tests. Commit `feat: launch immutable versioned local runtimes`.

## Task 8: verified updates, safe extraction and rollback

**Files:** Create runtime network, manifest, download, verify, extract, update and rollback modules; CLI update command; `tests/distribution/{updater,provenance,extraction}.test.ts`.

- [ ] Write verification rejection tests before downloading executable content:

```ts
it.each(['tampered-digest', 'wrong-repository', 'wrong-workflow', 'untrusted-issuer', 'wrong-package-subject', 'missing-attestation'])('rejects %s without changing selection', async defect => {
  const host = await signedReleaseFixture(defect);
  await expect(host.updater.install()).rejects.toMatchObject({ code: 'RELEASE_UNVERIFIED' });
  expect(await host.activeVersion()).toBe('1.0.0');
  expect(host.executedCandidate).toBe(false);
});
it.each(['../escape', '/absolute', 'package/link -> ../../outside', 'package/NUL', 'package/a:stream'])('rejects archive entry %s', async entry => {
  await expect(extractFixture(entry)).rejects.toThrow();
});
```

- [ ] Run `npx vitest run tests/distribution/updater.test.ts tests/distribution/provenance.test.ts tests/distribution/extraction.test.ts`; expect missing verification/extraction.
- [ ] Restrict transport to configured official public npm registry/release endpoints. Validate HTTPS scheme, hostname, port and each redirect; never follow metadata-provided arbitrary URLs. Apply compressed/uncompressed byte limits, request timeout, abort and bounded retry. Send only generic product/version/platform compatibility information required for updates, never project paths/names/spec contents/evidence/approval information or installation identifiers. Inject the network client and clock so fully offline tests can prove no call occurs.
- [ ] Parse untrusted public metadata but execute nothing. Verify tarball integrity with the registry's declared strong digest; then verify attestation subject digest/package, certificate chain/issuer, expected `hanselhansel/robopomelo` repository and release workflow identity, transparency proof and trusted signing time through maintained npm/Sigstore tooling. A checksum or arbitrary Sigstore-valid signature is not adequate. Bundle a locked compatible `sigstore` verifier and call `await sigstore.verify(bundle, artifact, verificationOptions)` rather than relying on the user's npm. Verify DSSE/provenance through the maintained library, then inspect only its verified statement to enforce package/tarball digest and expected repository/workflow. Exact identity matching uses an anchored regex where the library option is regex-based. Do not trust unauthenticated `gitHead` or merely decoded certificate fields. The current package engine floors, not stale older documentation, govern Node support; parent research on 2026-09-05 found current floors `^22.22.2 || ^24.15.0 || >=26`. Lock the verifier and runtime matrix together, updating the local build runtime if necessary rather than weakening verification. `npm audit signatures --include-attestations --json` remains a separate release verification check in an isolated package fixture, never a dependency audit on a user's project. Verification failures preserve the active version and cannot be bypassed by `--yes`.
- [ ] Keep compatibility/release manifest inside the verified payload. Compare external metadata with the verified internal manifest before selecting the release. Check stable semver/channel, supported ranges and zero migration requirement for automatic install. Explicit prerelease/major requests still require verified provenance and a supported launcher handshake; they cannot disable source integrity.
- [ ] Extract into a newly created private staging directory with mature streaming archive tooling. Reject traversal, absolute/drive/UNC/device paths, every symlink/hardlink/device entry, duplicate names, portable case collisions, reserved names, sparse/excess-size entries and entry-count explosions. Only regular files and directories are allowed. Run through SafeFs primitives and exclusive create; do not execute npm scripts or call candidate code until verification and completeness checks pass. The bundled verifier operates on the downloaded payload and verified attestation before candidate execution; any restricted inert extraction needed to inspect manifest contents stays inside private staging. Use `tar-stream` for entry-level streamed extraction or the maintained npm `tar` package only with an explicit entry filter and the same adversarial tests. Then flush and atomically promote.
- [ ] Persist verification evidence, payload digest and source identity beside the immutable cache manifest. Rollback only chooses a still-intact verified cached runtime whose manifest can read the current spec; never migrates a project backwards. Recovery from interrupted download/extract/rename retains the working runtime and only removes generated staging directories after ownership/path checks. Cache cleanup never deletes the active or previous working runtime.
- [ ] `update check` reports available/pending/current/policy without promotion; `install` follows policy or explicit version; `rollback` reports chosen version and compatibility. Browser Settings calls the same service and shows last outcome, automatic/notify/off mode, pin and offline status. No independent agent-Skill directory is silently rewritten.
- [ ] Verify malicious redirects, timeout, invalid signatures, valid signature/wrong workflow, compressed bombs, lifecycle-script payloads, insufficient disk, interrupted promotion, revoked release policy, explicit candidate, migration-needed update, rollback incompatibility and package-manager-owned launch tests. Commit `feat: verify compatible releases before automatic runtime updates`.

## Task 9: integrated failure and distribution verification

**Files:** Create `tests/distribution/installed-runtime.test.ts`, CLI doctor command, and four operating-contract documents listed above. Add CI jobs through the coordinator-owned workflow files.

- [ ] Run `npm run build`, `npm run typecheck`, `npm run check:boundaries`, `npm run check:source-lines`, and `npx vitest run tests/runtime tests/security tests/distribution`. Expected: passing tests, no source file over 399 lines, no forbidden imports. Failures block commit/release.
- [ ] Run `npm pack --json`, install that exact tarball into a fresh temporary prefix with `npm install --prefix <fixture-prefix> --ignore-scripts <absolute-tarball>`, and invoke its installed executable. Run create/example, wizard scripted PTY, browser open, patch, evidence copy, validate, history restore, export and reopen using the packaged assets. Packaging fixture utilities must expand actual safe temporary paths; do not paste angle-bracket arguments as literal shell commands.
- [ ] Run `npx playwright test tests/browser/runtime.spec.ts` with outbound network denied except loopback. Exercise the actual browser workflow, refresh/bootstrap, terminal/browser concurrency, invalid external YAML, copied-project trust, export download and shutdown recovery. Inspect generated A4/Letter HTML through the artifacts/frontend QA owner.
- [ ] Execute the installed-package matrix on native macOS, Windows and Linux for all declared architectures. Test Node 22/24 minimum supported minor versions and active LTS updates. Real Windows junction tests, not just `path.win32` unit tests, are required. A skipped native operating-system target is missing coverage, not support proof.
- [ ] Run release-updater fixtures using signed test artifacts from a controlled test trust root, then validate the real RC provenance and installed package through the production trust policy without substituting the test root. Offline recovery must work using the cached verified RC. A real stable update requires a later published stable fixture/version; first release documents the signed fixture evidence rather than claiming a nonexistent prior public upgrade occurred.
- [ ] `doctor` reports writable roots/cache, config parsing, active runtime integrity, lock diagnostics, pending recovery, supported OS/Node, offline/pin mode and verified update outcome. It must not modify projects, steal locks or upload diagnostics automatically. Document explicit repair paths and the distinction between asserted human decisions and verified package publisher identity.
- [ ] Commit each independently green document/check change. Parent performs the single whole-branch review and release-owned checks; do not add duplicate global reviews here.

## Material security/integration decisions for parent reconciliation

1. **Confinement wording must match the attacker boundary.** Operation-time validation, escaping-link rejection, exclusive new-file writes and opened-file identity checks protect against untrusted path inputs and reduce races. Pure JavaScript cannot close every parent-directory substitution race from an unrestricted same-user process. No permitted HTTP operation may create links or arbitrarily rename ancestors. Autoplan must flag any contradictory public claim, rather than silently adding a native sandbox or claiming kernel-level confinement.
2. **Publisher provenance needs authenticated platform configuration.** Exact npm/Sigstore APIs and the repository/workflow identity must be fixed by parent research. npm login/trusted-publisher setup is an external release dependency. Fixture verification cannot prove real npm publication or publisher identity.
3. **Decision recording is separate authority.** Parent core must protect accepted decisions, risk-review obligations and review records, not only a root `approval` field. Runtime grants and frontend controls do not replace this core check.
4. **Browser credentials are port-bound through origin, not cookies.** Single-use fragment bootstrap plus tab-scoped session storage supports refresh without loopback-cookie leakage across ports. Any XSS could still read browser-held credentials, so CSP/sanitization are release gates. Credentials must never appear in URL query strings or logs. Server restart invalidates old tab sessions.
5. **Recovery is a multi-file protocol.** Evidence removal is reference removal with retention; source rename cannot declare the entire transaction finished. External edits with unknown hashes must remain preserved, even when that stops automatic recovery.
6. **Updater version selection and project compatibility are coupled.** `npx` package pins and managed runtime pins differ. A new runtime must never open an incompatible spec or activate an unstable capability merely because semver is compatible. An update with changed validation semantics must rerun review validity.

## Plan self-review

Coverage: safe YAML/comments/extensions, source/hash conflicts, locks, journal recovery, evidence copy/removal/hash integrity, complete migration backups, machine-local grants, loopback security, untrusted rendering, upload/export resource bounds, actual native platform behavior, pin/offline modes, provenance/integrity, immutable cache, rollback and all approved trust/update/doctor commands each have an implementation task and a failure test. Parent-owned domain logic, document formatting, UI screen rendering and release workflows are explicit integration dependencies, not duplicated implementations.

Execution remains in the existing isolated worktree. No user choice is needed between workflows because end-to-end routine green execution is already authorized. Parent reconciles contracts and autoplan findings before these steps begin.

## DX amendment: persistent update selection

Persist update mode, optional exact pin and optional rollback hold separately. A rollback hold contains selected version, previous selection and policy snapshot. Rolling back to a previously verified compatible cached version atomically creates the hold; subsequent automatic launches stay there until explicit `update configure --resume`. Preserve a preexisting exact pin. Resume clears the hold and restores the prior policy; explicit policy edits after rollback update the current policy, so resume must not overwrite later edits. Tests cover rollback, exit, relaunch, preexisting pin, policy edit during hold and resume.

Selection precedence: explicit `--runtime-version` for that run, rollback hold, persistent exact pin, compatible selected cache, bundled runtime. Each selection is still subject to verified-cache and project compatibility checks; never fall through silently when an explicit version is unavailable or incompatible. `--update-mode` overrides stored mode for this invocation only. `--offline` is an absolute no-network constraint. Mode off disables automatic checks; explicit manual check/install may use network only when offline is absent. Offline check returns a clearly cached/not-checked result rather than a claim of current registry freshness. Explicit install conflicting with a persistent pin/hold fails with policy-conflict guidance to configure it first. Never silently clear either. Startup cannot auto-install a different runtime while an explicit version/pin/hold is active.

Every CLI/browser/doctor policy display uses the same selector and same reason enum. Read-only version/help cannot create machine directories, mutate stale cache indexes or download. Add bounded, closed-stdin tests for every updater leaf and two cached runtime versions, and real process rollback-to-relaunch tests.

## Final engineering corrections: transactions and receipts

After flushing the prepared journal, publish every added immutable evidence file to its final generated path using no-replace operations, verify its digest/size, and flush before replacing deployment.yaml. Source replacement remains the commit point. A crash before it leaves old source and possibly harmless unreferenced additions; retain them for recovery rather than deleting uncertain files. A crash after replacement must leave every newly referenced evidence file available at its final path. Recovery checks both staged/final path identities and hashes. Fault tests assert exact old/new expected outcomes at each stage, including before/after evidence publication; accepting either source indiscriminately is insufficient.

Persist the shared typed mutation receipt as part of validated journal/history/proposal records. Lookup is read-only, project-bound, digest-bound and inspect-authorized. Add /api/changes/:id and CLI show --change lookup; do not invent success from a dropped connection or absence of a live writer. For uploads, bind mutation ID to metadata and selected bytes, independently verify streamed hash/size and reconcile the receipt after cancellation/response loss. Test response loss after source replacement and exactly-once retry, plus pending/proposed/committed/not-found/indeterminate receipt states.

Core-owned invalidation arrays are serialized with each approved mutation candidate and preserved by history restore/reconciliation/export. Runtime never writes them by independently guessing approval semantics. Read-only operations remain read-only.
