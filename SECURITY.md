# Security policy

## Report a vulnerability privately

Use **Report a vulnerability** in this repository's GitHub Security and quality area when private vulnerability reporting is enabled. This creates a private advisory report. The presence of this file does not prove that the GitHub feature is enabled.

If the private reporting option is unavailable, open a public issue asking only for the maintainer's preferred private security contact. Include no exploit, private source, credentials or customer details in that issue. Follow the private channel subsequently supplied by the maintainer. This follows [GitHub's private-reporting guidance](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

In the private report, include affected package/spec versions, operating system and Node version, the vulnerable path, a minimal reproduction, expected boundary and observed impact. Use synthetic data. Do not send working bootstrap URLs, session credentials, registry credentials or a private deployment folder by default.

Coordinate disclosure with the maintainer. There is no promised response-time SLA in this policy. Fixes and affected versions are communicated through release notes and advisories when available.

## Version support

Use the currently published release/advisory record to determine affected and fixed versions. A version named in a design plan is not proof that a distribution has been published or tested. No production legacy migration adapter is bundled with v1. Unsupported source or runtime combinations stop rather than receive a guessed conversion.

## Application boundary

RoboPomelo is a local AMR planning and engineering-handoff application. Readiness evaluates specification completeness and recorded review context. It does not establish commissioning, physical safety or successful execution of a planned test. There are no robot/facility writes, simulator execution, telemetry, project upload or model calls in core project workflows.

The browser service binds to loopback at `127.0.0.1` on an assigned port. Requests are bound to the expected Host, local session credentials and project epoch. Mutations also require the CSRF credential and expected Origin. Bootstrap secrets are temporary and single-use. A browser tab or a URL is not independent authority over project files.

Untrusted source, attachments, Markdown and third-party text are data. They cannot install code, grant scopes, select arbitrary roots or issue commands. YAML parsing is bounded and rejects executable/custom tags, anchors, aliases, unsafe mappings and unsupported structures. Referenced schemas and UI assets are bundled; project data does not select a remote schema resolver.

Managed paths are validated at operation time. Root identity is pinned. Managed symlinks/junctions and escaping or nonportable paths are rejected. Writes use newly created files and checked publication instead of truncating an existing untrusted inode.

These JavaScript checks are not a kernel-enforced sandbox against an unrestricted same-user process racing filesystem replacement. They do not constrain software that can replace the app, alter machine settings or directly edit the user's files. The product must not expose arbitrary directory substitution or filesystem methods through HTTP.

## Authority and recovery

Inspection, authoring, evidence, export, decision recording and settings management are distinct scopes. Grants bind the project identity to its canonical root and native filesystem identity. Copying, moving or replacing a root requires reevaluation. `--yes`, source metadata and Skill frontmatter do not grant authority.

Actor names, delegation and recorded human decisions are supplied assertions. They are not authenticated proof that a named person attended a meeting or that a named model produced a patch. Declared Skill capabilities restrict their declared writes; they do not establish the agent's identity.

Every source mutation rechecks its source base and final authorization. Recovery uses validated journals and exact byte hashes. It does not install uncommitted candidates or overwrite an unrelated external source. Retirement is explicit, keeps recovery material and prevents reuse of that mutation ID. History restoration preserves current review/revocation records. Migration recovery uses verified backups and an explicitly selected empty destination, with fresh trust afterward.

## Updates and exported data

Managed updates are the built-in network exception. Offline mode disables updater requests. Candidate code is not run before package integrity, configured publisher/workflow provenance and compatibility checks. A checksum alone or an unrelated valid signer does not satisfy that policy. Explicit pins and rollback holds remain effective, and an active project session is not replaced mid-run.

Exports contain exact source and explicitly selected supporting attachments. Unselected, external and future evidence are disclosed rather than silently fetched. Private history, trust settings and runtime caches are excluded from review packages. Downloaded attachments remain untrusted and are not application code.

See the detailed [runtime boundary](docs/superpowers/specs/robopomelo/runtime-security-updates.md). Native-platform and installed-release evidence must be reported separately; a skipped platform test is not a verified platform.
