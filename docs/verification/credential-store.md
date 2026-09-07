# Machine credential store verification

D4 implementation keeps credentials in a main-process-only directory configured
from the desktop application's machine user-data location. Selected projects and
renderer requests cannot choose this location. `CredentialStore.open` rejects
relative/non-canonical paths, linked ancestors, insecure directory permissions,
and paths under a `deployment.yaml` project marker. The runtime integrator owns
providing the fixed machine directory and withholding `getSecret` from IPC/HTTP.

Each opaque connection ID addresses one encrypted record. Provider, optional
label, creation time and secret are encrypted together. Lists return only the
metadata projection. Secrets are limited to 16 KiB; labels are limited to 120
bytes and cannot contain that record's secret. Labels are display metadata and
must never be populated from credential payloads by adapters.

Writes use exclusive 0600 staging files, file fsync, atomic publication and
directory fsync under the shared machine settings lock. The directory is 0700.
Readers reject linked, hard-linked or broadly readable credential files. Only
ciphertext is staged. Stale encrypted stages are discarded under the lock before
an operation, so removal also clears crash remnants. Removal does not require
successful decryption and flushes the directory before returning. Lock owner
metadata is transient, follows project-fs locking rules, and contains no secret.
No plaintext credential backups are created. Failed operations expose fixed
error codes/messages without provider error text, secret values or local paths.

The injected macOS adapter uses Electron 44.2.0 asynchronous safeStorage methods
only after `isAsyncEncryptionAvailable`. It refuses other platforms and has no
plaintext fallback. Temporary-unavailability errors preserve the stored record.
A successful decrypt with `shouldReEncrypt` rewrites an encrypted record under
the lock before returning it. A failed rotation returns an error and retains the
previous record. Production construction must happen after `app.whenReady()`.

Evidence retrieved 2026-09-07: [Electron safeStorage documentation](https://www.electronjs.org/docs/latest/api/safe-storage)
and pinned `node_modules/electron/electron.d.ts` for the asynchronous interfaces.

## Automated checks

`npx --no-install vitest run tests/desktop/credentials.test.ts` covers persistence,
metadata projection, permissions, malformed ciphertext, traversal, symlinks,
project-directory rejection, missing records, bounded input, encryption denial,
sanitized errors, concurrent store instances, durable removal, encrypted crash
remnants and failed key rotation. The encryption fixture is reversible base64
encoding. These are filesystem/contract tests, not cryptographic acceptance.
`npm run typecheck` and `npm run check:boundaries` also pass.

No test reads existing account credentials, calls actual macOS Keychain or opens
an authentication flow. Signed-app QA must still verify macOS Keychain access,
temporary lock/unavailability behavior, persistent identity across signed app
updates, real key rotation, and that renderer/API/export surfaces never receive
secrets. JavaScript strings cannot be reliably zeroized. The store inherits
SafeRoot's documented same-user ancestor-replacement race limitation; it does
not claim kernel-enforced confinement from an unrestricted same-user process.
