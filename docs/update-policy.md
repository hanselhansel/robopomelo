# Update policy

Automatic compatible stable updates are the default. The launcher checks fixed public RoboPomelo release metadata, verifies the package's provenance and complete payload, and selects a compatible runtime for a new process. It transmits no project content, paths, filenames or hashes.

An update must match the expected npm package, source repository and main release workflow. Verification checks the archive digest, certificate identity, transparency evidence, trusted signing time, manifest and every payload file. A checksum by itself does not authorize execution. Verification or network failure leaves the verified local runtime available.

| Policy | Behavior |
| --- | --- |
| `auto` | Select an eligible newer stable release in the current major |
| `notify` | Report availability without automatic installation |
| `off` | Suppress startup release checks |
| Offline | Suppress release-network access |
| Exact pin | Keep the named verified runtime; refuse unavailable pins |
| Rollback hold | Keep the chosen earlier runtime until explicit resume |

Prereleases, major upgrades, specification migrations and experimental capabilities are never activated automatically. Running sessions retain their original runtime. A policy change during verification prevents stale policy from promoting a runtime.

```sh
robopomelo update status --json
robopomelo update configure --mode notify --authorize manage-settings
robopomelo update install --target VERSION --authorize manage-settings
robopomelo update configure --pin VERSION --authorize manage-settings
robopomelo update rollback --authorize manage-settings
robopomelo update configure --resume --authorize manage-settings
```

Use a real exact version. An explicit install still enforces signature and compatibility checks. `--yes` cannot waive those checks. Resume clears the hold while preserving later deliberate preference edits.

The original launcher, its bundled runtime, the selected runtime and the current session runtime are separate identities. `--version --json` and Settings expose them. Installing a future runtime does not rewrite the launcher already installed by npm; update that installed package deliberately when a new launcher protocol or signature trust root is required.

Cache and preferences are machine-local. Portable project folders do not carry trust grants, cached executable code or update permissions. See [storage and recovery](project-storage.md) and [offline operation](offline-operation.md).
