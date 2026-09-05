# Security boundaries

The local server binds to `127.0.0.1` on an ephemeral port. A short-lived, single-use launch secret establishes browser credentials. Host/origin checks, CSRF protection and a project-selection epoch prevent unrelated sites or stale project tabs from issuing accepted writes. Treat a `--no-browser` launch link as a temporary local credential.

The server serves bundled local assets. Project text renders as text. YAML, Markdown, attachments, patches, vendor references and extension values are untrusted data. Aliases, unexpected tags, traversal, escaping symlinks, prototype keys and resource-limit violations are rejected at their applicable boundaries.

Each filesystem operation works through an explicitly selected root. Evidence copying requires a separate selected-file handle; project text cannot name arbitrary files to read. Migration recovery writes only to an explicitly selected empty destination. Atomic writes, immutable receipts and hash checks preserve the distinction between committed, proposed, pending, retired and unknown outcomes.

Trust grants are scoped and machine-local. `--yes` is not authority. Agents do not approve their own work or waive blockers. Human decision records preserve the supplied recorder, approver and provenance. Identity is asserted locally; this is not an electronic-signature or identity-verification system.

Release transport is restricted to public RoboPomelo package metadata/artifacts. No project data is sent. Offline mode suppresses that exception. The runtime cache executes only verified compatible payloads; malformed or substituted archives fail closed.

Portable files cannot prove that a person told the truth or that another copy is the latest project. Same-user malware can also operate outside this process. Those are documented limits, not permissions for RoboPomelo to relax its own checks. Do not place passwords, API keys or other secret material in `deployment.yaml`.

RoboPomelo performs no robot commands, facility-system writes, safety certification or physical acceptance execution. Future MCP access starts read-only and stays optional. See [SECURITY.md](../SECURITY.md) for vulnerability reporting and [the approved runtime specification](superpowers/specs/robopomelo/runtime-security-updates.md) for the detailed design.
