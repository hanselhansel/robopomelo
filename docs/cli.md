# CLI reference

Use `robopomelo <command> --help` for each command's exact options. Help is derived from the command registry and parser. Finite commands with `--json` write one JSON object and one newline. They never prompt. Diagnostics belong on stderr.

Select a project with `--project <folder>`. Project commands also accept the current directory when it contains `deployment.yaml`. Only `init`, `open`, `plan`, or an explicit project selection choose a folder. A folder mentioned inside a patch, review record, or evidence declaration never selects a host directory.

```sh
robopomelo init demo --example inbound-pallet --authorize author --yes
robopomelo show --project demo --json
robopomelo validate --project demo --json
robopomelo export --project demo --format files --no-evidence --authorize export --yes
```

`init` requires explicit `--authorize author` before creating a folder. `--yes` does not grant it.

The inbound-pallet example is fictional. Its unknown and unverified information stays visible in validation and exports.

## Command inventory

| Command                          | Result                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `open [folder]`                  | Browser workspace through the application entrypoint; `--no-browser` keeps the explicit one-time launch link in the initiating terminal |
| `plan [folder]`                  | Five-step terminal workflow; requires a TTY and rejects `--json`                                                                        |
| `init <folder>`                  | Blank or `--example inbound-pallet` project; refuses a nonempty target                                                                  |
| `show`                           | Snapshot, `--id <stable-id>`, `--traceability`, or `--change <id> --digest <sha256>` receipt                                            |
| `validate`                       | Shared readiness report; blockers return exit 3                                                                                         |
| `patch check <file               | ->`                                                                                                                                     | Predicted diff and readiness without a source write                |
| `patch diff <file                | ->`                                                                                                                                     | The same evaluated before/after field diff                         |
| `patch apply <file               | ->`                                                                                                                                     | Applied, proposed, or already-applied mutation result              |
| `history list`                   | Recorded revisions; `--proposals` lists stored proposals                                                                                |
| `history show <revision>`        | Verified historical source and snapshot                                                                                                 |
| `history restore <revision>`     | Authoring restore as a new revision, preserving protected current review history                                                        |
| `history reconcile`              | Explicitly record external source edits using the supplied current hash, actor and optional reason                                      |
| `history recover`                | Finish metadata for an already committed source; unresolved old/unknown source remains unchanged                                        |
| `history retire <change>`        | Retire an explicitly identified uncommitted attempt while its exact old source remains present                                          |
| `evidence add <file>`            | Copy one selected regular file with supplied purpose, title and provenance                                                              |
| `evidence add --reference <uri>` | Record an inert external reference without fetching it                                                                                  |
| `evidence list`                  | Declared evidence records                                                                                                               |
| `evidence check`                 | Current local attachment observations; no external fetch                                                                                |
| `evidence remove <id>`           | Remove the active reference while retaining recovery/history bytes                                                                      |
| `review acknowledge <file        | ->`                                                                                                                                     | Supplied warning acknowledgments                                   |
| `review waive <file              | ->`                                                                                                                                     | Supplied waivers for explicitly eligible warnings                  |
| `review approve <file            | ->`                                                                                                                                     | Supplied approved, rejected or changes-requested operator decision |
| `review revoke <id>`             | Supplied actor, source, reason and decision date bound to the explicit source base                                                      |
| `export`                         | ZIP or `--format files`, confined beneath the project's `exports/` directory                                                            |
| `migrate --target <version>`     | Preview; `--apply` requires exact base, actor and author authority                                                                      |
| `capabilities`                   | Core, Skill and adapter stages, ranges, availability and declared writes                                                                |
| `trust show`                     | Effective authority for the selected project                                                                                            |
| `trust grant`                    | Remember the supplied scopes and mode                                                                                                   |
| `trust revoke`                   | Revoke the selected project's remembered grants                                                                                         |
| `trust forget`                   | Forget trust without deleting the project                                                                                               |
| `doctor`                         | Read-only local runtime, source, settings, lock and recovery diagnostics                                                                |
| `update check`                   | Explicit channel check, or cached/not-checked information offline                                                                       |
| `update install [version]`       | Verified installation; `--target` also selects an exact version                                                                         |
| `update rollback [version]`      | Compatible local runtime selection with a persistent rollback hold                                                                      |
| `update configure`               | Mode, exact pin, explicit pin clearing, rollback resume and explicit online policy                                                      |

## Inputs, authority and mutation results

`patch` and structured `review` files contain the complete public envelopes, including project ID, base revision/hash and supplied actor. Use `-` for bounded JSON stdin. Input is limited to 8 MiB, strict UTF-8 and the shared structural limits. It is never consumed as a confirmation. Use `--` before a filename beginning with `-`. Evidence copying takes an explicit regular file path; `./-` refers to a physical file named `-`.

`--authorize` accepts `inspect`, `author`, `evidence`, `export`, `record-decisions` and `manage-settings`, separated by commas or repeated. It authorizes this invocation. `--yes` adds no authority, reviewer identity, waiver eligibility or decision date. A remembered author grant never becomes operator approval authority automatically.

`trust grant` persists the requested scopes; `--remember` is an explicit spelling of that intent. Use per-run `--authorize` for a one-off operation. Grant, revoke, forget, explicit update installation, configuration and rollback require explicit `manage-settings` authorization.

Commands that construct mutations outside a structured file require `--actor` JSON. For example, `'{"kind":"human","name":"Reviewer","source":"Supplied meeting record"}'` is an attributed assertion, not authentication. `history restore`, evidence changes and migration apply require `--base-revision` and `--base-hash` from the reviewed source. Reconciliation requires its current `--base-hash`. Revocation additionally requires the supplied `--date`, `--source` and `--reason`; the CLI does not invent a decision date.

A proposed change is not an applied revision. Inspect `history list --proposals`, then use `patch apply --proposal <id> --digest <patch-digest> --base-revision <revision> --base-hash <sha256>` to apply that exact stored proposal. Receipt lookup uses the separately returned `receiptDigest`, not the proposal's approval digest. After a dropped response, inspect `show --change <id> --digest <receipt-digest>` before retrying.

Skill-produced patches must preserve `capabilityId`. Core checks the registered Skill's declared writes and all ordinary protected-field permissions. This declaration does not authenticate the agent host.

## Export and recovery

Choose exactly one of `--no-evidence`, `--all-evidence`, or `--include-evidence <comma-separated-ids>`. `--all-evidence` selects attachments, not external URLs or future requirements. `--output` is one portable output name under `exports/`; absolute paths and traversal are rejected. Blocked drafts can be saved and exported successfully while their reports remain blocked.

`history recover` never installs an uncommitted candidate. If an attempt remains uncommitted, inspect its receipt and use `history retire <change> --digest <receipt-digest> --base-revision <old-revision> --base-hash <old-hash> --actor <json> --reason <text> --authorize author` only when abandoning that exact unchanged attempt. Unknown source state remains preserved for inspection.

The current specification is 1.0.0. Migrating an already valid 1.0.0 source to 1.0.0 reports `noop`. Other transitions require an installed validated adapter; unavailable transitions return exit 7. Never treat history restore as schema-migration rollback. Preserve a reported migration backup manifest and inspect actual source/receipt state after an I/O failure.

## Update controls

Selection order is per-run `--runtime-version`, rollback hold, persistent exact pin, compatible selected cache, then bundle. Exact unavailable selections fail without silently choosing a different version. `--update-mode auto|notify|off` overrides the stored mode for one invocation. `--offline` is absolute for that invocation and is not silently persisted by another configuration change.

`update configure --mode auto|notify|off`, `--pin <exact-version>`, and `--clear-pin` edit policy. `--online` explicitly clears an existing stored offline policy. `--resume` clears a rollback hold while preserving policy edits made after rollback; run it separately from other policy edits. Explicit CLI installation requires `--authorize manage-settings`; automatic compatible startup updates follow the configured policy. Update installation cannot clear a conflicting pin or hold. Version/help are read-only. Existing processes retain the exact runtime and bundled assets selected at launch.

## Exit codes

| Exit | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| 0    | Operation succeeded, including a saved or exported blocked draft |
| 1    | Unexpected internal failure                                      |
| 2    | Invalid arguments or structured input, or non-TTY wizard request |
| 3    | Validation blockers or failed final-approval gate                |
| 4    | Stale base, reviewed content or concurrent-write conflict        |
| 5    | Missing/revoked authority or declared Skill write boundary       |
| 6    | Filesystem, evidence, recovery or archive I/O failure            |
| 7    | Unsupported specification, runtime, capability or migration      |
| 8    | Explicit update network, verification or installation failure    |
