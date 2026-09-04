# Runtime, security, permissions, and updates

Part of the [RoboPomelo v1 design](../2026-09-05-robopomelo-design.md). Written-spec review pending.

## Package and dependency boundaries

| Area | Owns | May depend on |
| --- | --- | --- |
| `packages/spec` | Schemas, static capability/unit registries, supported ranges | No application package |
| `packages/core` | Domain checks, readiness, traceability, patch semantics, approval validity, shared workflow definitions | spec; pure deterministic libraries |
| `packages/project-fs` | Parsing/serialization boundary, project transactions, evidence files, history, machine-local trust/config | spec, core; Node filesystem/crypto facilities |
| `packages/artifacts` | Markdown/HTML/report/manifest generation and archive payload description | spec, core; deterministic rendering utilities |
| `apps/cli` | CLI, terminal wizard, protected local server, updater coordination | All shared packages |
| `apps/web` | Browser UI and local-server client | spec/workflow contract types; UI libraries; no filesystem imports |
| `skills` | Standard-format instructions and thin CLI invocation guidance | Public CLI/patch contracts |

No circular dependencies. Core logic has no filesystem, network, UI or model access. The server passes explicit observations into pure validation. Export formatting uses domain results; it cannot implement a different readiness calculation.

Internal packages may be bundled into the public `robopomelo` npm distribution rather than independently published. All ship under one coordinated product release. The exact library choices and locked versions are implementation-plan decisions, evaluated against offline packaging, platform support and these boundaries.

Keep source files under 400 lines. Split modules by responsibility. Do not duplicate validation or form semantics just to satisfy the line limit.

## Portable project contents

| Location | Purpose |
| --- | --- |
| `deployment.yaml` | Authoritative project data |
| `evidence/` | Copied, referenced supporting files |
| `.robopomelo/history/` | Immutable source snapshots, transaction records and diffs |
| `.robopomelo/recovery/` | Recoverable interrupted writes and migration backups |
| `exports/` | Generated packages and individual outputs |

History, recovery and exports are ancillary to the source, not competing editable databases. A project can be reconstructed from source plus evidence; history availability improves recovery. Machine trust and update policy must not be stored here.

Machine-local application directories contain authorization grants, update preferences, version pins and cached runtime packages. Treat these as bounded configuration/runtime storage exceptions. Do not maintain a second catalogue containing project documents or evidence outside the portable folder.

## Atomic writes and crash recovery

All supported writers use the same transaction protocol:

1. Acquire a per-project interprocess lock with recorded owner/process identity. Treat a lock as stale only after checking liveness and ownership, not elapsed time alone.
2. Read source bytes and check the caller's expected revision/hash again under the lock.
3. Prepare the new source, diff, evidence changes and history metadata in the project filesystem. Validate before committing.
4. Persist a recovery journal describing the old and new hashes and intended transaction.
5. Stage immutable evidence additions and the new snapshot. Flush files as supported, then replace `deployment.yaml` atomically on the same filesystem.
6. Complete the history/index record and mark the journal committed. Release the lock.

An atomic rename of the source file is not an atomic multi-file transaction. On reopen, recovery examines the journal and actual hashes and either completes the committed transaction or restores the earlier source. Recovery must never guess based only on timestamps.

Evidence deletion normally removes the active reference while retaining a recovery copy. Do not automatically erase evidence still needed by a historical revision. Storage cleanup is an explicit operation with a preview, outside automatic updating.

Migration makes a complete restorable project backup before mutation. Validate the migrated result and compare extension/evidence preservation before replacing the source. Failure leaves a readable previous project.

## Concurrent and external edits

Each browser view and CLI change carries a base revision and source hash. File watching detects external YAML changes but does not grant the watcher write authority.

If another writer changes the source, preserve pending edits and return a structured conflict containing the base/current identities and proposed diff. Refresh and rebase only when the transformation is demonstrably nonconflicting; otherwise require an explicit resolution. Never apply a stale patch against a new revision just because field names still match.

Malformed external YAML opens in a recoverable inspection state. Show parser locations, the last readable revision and available restore options. Do not silently normalize or overwrite the user's file. Valid external edits are registered in local history on reconciliation, with provenance indicating an external edit; material changes invalidate approval.

## Evidence and untrusted content

`evidence add` may read one explicitly selected external source file to copy it into the project. That authorization does not permit arbitrary external directory reads. Project-managed evidence must resolve inside the project root. Reject path traversal, absolute output paths in project records, escaping symlinks and symlink substitution at operation time.

Validate paths at use time, not only when opening the project. Use exclusive file creation, resolved paths and safe platform primitives to reduce check/use races. Test Windows separators, drive/UNC forms, case behavior, reserved names and junction/reparse-point escapes as well as POSIX symlinks.

Do not execute attachment contents, YAML tags, Markdown scripts or embedded HTML. Sanitize rendered Markdown and use a restrictive content-security policy. Untrusted attachment types download for explicit inspection rather than execute inside the app's origin.

External references are inert data. Following one is an explicit user browser action, not a background application fetch. Explain that leaving the local app invokes the destination site's behavior. No remote image/font/link preview loads in a review document.

## Local server boundary

Bind exactly `127.0.0.1` with an operating-system-selected ephemeral port. No LAN mode in v1. Print the actual URL. Close the server cleanly and release locks on shutdown.

Validate Host and Origin, deny wildcard cross-origin access, and protect mutations with a session-bound anti-CSRF token. Do not expose a long-lived token in project YAML or exported links. Use a restrictive CSP and deny framing. Read endpoints must also avoid leaking project data to cross-origin pages or DNS-rebinding hosts.

The HTTP API operates only on the explicitly opened root. It cannot execute arbitrary shell commands or accept an arbitrary path on every request. Explicit file-selection/copy actions have bounded authorization. Exports stream to the browser or write inside the project's selected export directory.

Initial engineering limits are 8 MiB for YAML or ordinary JSON requests, 64 nested data levels, 10,000 domain records, 256 MiB per copied attachment and 2 GiB of selected export payload. Evidence and archives are streamed rather than buffered as whole payloads. Reject over-limit input with a precise explanation and preserve the source. These limits are reviewed against fixtures before release; a trusted local configuration change can adjust documented limits, but imported project data cannot raise them.

## Permissions

Provide two modes: autonomous editing, recommended; and review each change. Permissions are operation-scoped, not based on how intelligent a model claims to be.

| Scope | Permits | Does not imply |
| --- | --- | --- |
| Inspect | Read the selected project, validate, diff, inspect history | Network access, unrelated filesystem reads |
| Author | Modify planning records, propose decisions/mitigations, make valid draft revisions | Operator acceptance, waiver authority, permissions changes |
| Manage supplied evidence | Copy selected files, edit references, integrity checks | Automatic downloads, arbitrary host reads, factual verification |
| Export | Generate artifacts from the selected revision and evidence selection | External transmission or approval |
| Record supplied decisions | Record an explicitly supplied human decision with provenance and exact scope | Inventing consent or accepting the agent's own work |
| Manage local settings | Grant/revoke trust, select update policy, pin versions | Modification by imported project data |

Remember grants using canonical project location plus project identity. A different project at that location or a moved/copied project requires reevaluation. Do not trust a file merely because it declares the same project ID. Document the residual limitation when local software can alter both project and machine settings.

The trusted project authoring grant persists until Forget this project or revoke. Revocation affects subsequent operations, including queued work before commit. It does not erase project data or history. A narrowly scoped explicit CLI authorization supports unattended runs without a fake human-presence prompt.

An agent host can provide additional sandboxing. RoboPomelo does not configure or weaken that host's sandbox, claim human identity from a TTY, or use an LLM to decide permission grants.

## Network policy

Core project operations make no outbound requests. Bundle schemas, templates, fonts, icons and browser assets. No telemetry, analytics, project uploads, hidden model calls, or remote-content resolution.

The updater may request public release metadata and package payloads from documented registry/release endpoints. Requests must not include project names, paths, content, evidence, local approvals or a persistent installation-tracking ID. These are network requests and must be disclosed as such; ordinary transport metadata still exists.

Fully offline mode disables updater requests and uses an installed/cached runtime. npm's initial download is a separate installation step; an uncached package cannot be installed from the internet while offline. Document an installed/pinned offline launch path.

A user may separately grant their chosen cloud-backed agent access to project files. That host may send read content to its provider. Skills explain this distinction; RoboPomelo neither performs those uploads nor grants network permission to the host.

## Updater architecture and policy

Automatic compatible stable updates are the default for supported managed launches. Provide notify-only, off and an explicit runtime pin. Offline, pinned, source-checkout and externally package-manager-controlled executions honor their selected policy. Noninteractive CI commands do not change their runtime mid-command.

Use a launcher plus versioned user-writable runtime cache within the coordinated distribution. Do not rewrite an npm-managed global package or source checkout behind its package manager. A managed launcher can select an already verified runtime from the cache without requiring administrator privileges. This is one release train, not independently versioned products.

Each process binds to one exact runtime and its bundled assets/Skills for its lifetime. A startup check may stage a newer compatible release; promotion occurs only before opening a project or at the next session. Never replace JavaScript or server code in an active editing session. Concurrent launches synchronize cache promotion independently of project locks.

Automatic eligibility requires:

- A stable release on the selected stable channel, newer than the active version and within the allowed major-version policy.
- Supported OS/architecture and local Node runtime.
- No required project migration and support for the opened project's specification range.
- Valid package integrity and expected publisher/source/workflow provenance according to the documented verification policy.
- No automatic activation of experimental/beta capabilities.

Semantic-version labels alone are not sufficient. The release manifest includes compatibility ranges and migration requirements. A compatible application update may change validation findings, so revalidation occurs before a new review decision; old output files retain their original version provenance.

The updater downloads into a temporary cache location, verifies before execution, tests package completeness and atomically switches the selected runtime pointer. Failed checks, interruption or insufficient space preserve the working version. Startup network checks have bounded timeouts and never prevent offline project use.

Rollback selects a previously verified runtime and verifies that it can read the current specification. It does not silently downgrade or rewrite a project. An incompatible project remains available for inspection/export or an explicit backup-based recovery workflow.

`update check` is read-only except bounded cache metadata. `update install` follows the selected policy or explicit version request. `update rollback` reports the selected version and project compatibility. Settings expose installed version, pending version, policy, pin and last outcome without requiring a cloud account.

An npm package pin and an application-runtime pin are distinct when using a managed launcher. Document the explicit RoboPomelo runtime-pin/offline flags and test that pinned invocation cannot select a newer runtime. Never promise that bare `npx` alone always fetches the newest package.

## Skills installation and updates

Bundle all six Skills with each product version and declare their supported specification/CLI ranges. Installation guides use each host's supported mechanism to reference versioned resources or copy Skills into an explicitly chosen host directory. The v1 CLI does not acquire a separate universal agent-host installer beyond its approved command inventory.

Do not silently overwrite a user's independently copied or modified Skills during a product update. Record installed origin/version where the user elects managed installation; synchronize only within that granted target. Otherwise show compatibility/version guidance. Support claims distinguish actual host runs from format-level validation and documented setup.
