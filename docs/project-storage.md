# Project storage and recovery

A project is a portable folder. `deployment.yaml` is its source of truth. Move or back up the complete folder while RoboPomelo is closed so evidence and history travel with it.

| Path | Purpose |
| --- | --- |
| `deployment.yaml` | Human-authored specification, revision identity and supplied review records |
| `evidence/` | Explicitly selected attachments with declared size and SHA-256 |
| `.robopomelo/history/` | Immutable source snapshots and revision entries |
| `.robopomelo/recovery/` | Transaction receipts, staged recovery data and migration backups |
| `.robopomelo/proposals/` | Immutable proposed changes and their original source bases |
| `exports/` | Generated review files and ZIP packages |

Project locks exist only while an operation owns them. A timestamp alone never authorizes stealing a lock. A live or uncertain owner blocks a conflicting write. Preserve lock/recovery files when an operation reports uncertainty.

Evidence selection records the file's initial SHA-256 through its open handle. Later inspection and copying check those same bytes as well as file identity and metadata. If the file changes, including when its timestamps remain unchanged, the operation reports `SELECTION_CHANGED`. Select the current file again before retrying.

Machine-local settings hold remembered trust and update preferences. The verified runtime cache is also machine-local. These are not project content and are not copied into a handoff. Trust binds the canonical folder, filesystem identity and project ID. Moving or restoring a folder requires fresh authorization.

## Inspect a lost response

Some local HTTP `500` responses with code `INTERNAL_ERROR` include `error.details.systemCode` and `error.details.operation`, for example `EPERM` and `rename`. Both fields appear only when the thrown value is an `Error` with a recognized filesystem code and operation; unsupported values omit these details. These diagnostic fields exclude raw messages, paths, stacks and nested causes. They identify the failed operation, not whether a source change committed, so inspect the receipt before retrying.

Keep the original change ID and receipt digest. `show` accepts both without replaying a different operation:

```sh
robopomelo show --project demo --change CHANGE_ID --digest RECEIPT_SHA256 --json --offline
robopomelo history recover --project demo --json --offline
```

Recovery completes bookkeeping only for a source already proven committed. An unknown outcome remains unknown. A verified uncommitted attempt can be explicitly retired with `history retire`; retirement preserves staging and prevents reuse of its mutation ID. Use that command's help for its exact original-source and actor inputs.

## Restore a historical authoring revision

Inspect `history list`, `history show REVISION` and current `show` first. Use the current revision/hash in the restore command, not the old revision's hash:

```sh
robopomelo history restore OLD_REVISION --project demo --base-revision CURRENT_REVISION --base-hash CURRENT_SHA256 --actor '{"kind":"human","name":"Supplied recorder"}' --reason 'Restore the reviewed authoring content' --authorize author --json --offline
```

This creates a new revision, keeps current review history and reevaluates prior approval. Additional protected obligations can require decision-recording authority. A concurrent edit produces a conflict rather than overwriting it.

## Migration backup recovery

V1 supports specification 1.0.0 and ships no production legacy migration adapter. A same-version migration is a no-op. Unsupported versions remain inspectable and are not guessed into a new schema. The tested migration backup engine is available to supported future migrations and recovery.

If a migration reports `MIGRATION_COMMITTED`, retain its returned `backupManifest` and `sourceHash`. Finish bookkeeping with the exact project-relative manifest path:

```sh
robopomelo migrate --recover .robopomelo/recovery/migration-UUID/manifest.json --project demo --json --offline
```

The command verifies the manifest, all backed-up hashes and the recorded migration identities. It never installs a candidate when the current source is old or unknown. For an independent recovery copy, first create a new empty destination folder:

```sh
mkdir recovered-demo
robopomelo migrate --restore-backup .robopomelo/recovery/migration-UUID/manifest.json --destination recovered-demo --project demo --actor '{"kind":"human","name":"Supplied recovery recorder"}' --authorize author --json --offline
```

Use the real manifest path and recorder supplied for the operation. Restore refuses a nonempty destination, verifies every copied member and returns its exact source revision/hash with `requiresFreshTrust: true`. The original folder stays intact.

Read the restored specification version before choosing a runtime. If it needs an earlier compatible runtime, select an exact already-verified cached version with `--runtime-version VERSION --offline`, or deliberately install that official package version through npm. An unavailable exact runtime is an error, never a silent fallback. Run `show --project recovered-demo --json --offline` under the compatible runtime and compare its `sourceHash` to the restore result and backup manifest. Authorize the recovered folder only after that inspection.

An interrupted restore leaves its partial destination for inspection. Preserve it and choose another empty destination for a retry. Do not overlay a partially copied folder or remove uncertain recovery evidence to force success.

Windows source commits may retry an `EPERM` rename failure up to eight total attempts while holding the existing project lease and authorization. Every attempt verifies the original file identities and expected old/new hashes. The deliberate backoff totals at most 775 ms; filesystem I/O time is separate. Changed or missing files and other errors stop the operation. Persistent denial retains a pending receipt and prepared recovery data; it is not reported as a successful save.
