# RoboPomelo v1 design specification

Date: 2026-09-05

Status: consolidated design approved by Hansel; this written specification awaits his review.

This is a documentation-only review artifact. No Git repository, application scaffold, package publication, or implementation is created by this document. The next steps are written-spec review, implementation planning, then autonomous execution of the approved scope.

## Purpose

RoboPomelo helps engineers, solutions engineers, systems integrators, and deployment planners think through warehouse AMR deployments. It makes uncovered needs, problems, challenges, assumptions, risks, and unresolved decisions visible and turns that reasoning into a traceable deployment specification.

The initial working user is a solutions engineer or deployment project manager at an AMR vendor or systems integrator. The warehouse operator reviews the proposed specification. V1 is free and open source, with no pricing, paid tiers, or payment messaging.

The product consists of a usable local application with an open deployment specification underneath it. Its output is an engineering handoff that can inform subsequent simulation and physical deployment work. V1 does not produce a runnable simulation or operate robots.

## Identity and scope

| Item | Requirement |
| --- | --- |
| Brand | RoboPomelo |
| GitHub repository | `hanselhansel/robopomelo`, public from creation |
| Canonical path | `/Users/hansel/conductor/repos/robopomelo` |
| History | New and independent Git history |
| License | Apache-2.0 |
| Structure | TypeScript-first monorepo |
| Primary launch | `npx robopomelo` |
| Supported operating systems | macOS, native Windows, Linux |
| Required local runtime | A supported Node.js/npm installation, documented and tested in the release matrix |
| Project storage | Ordinary portable folders; Git optional |
| Machine storage exceptions | Trust settings, update preferences, installed-version caches |
| Reference project | Fictional inbound pallet transport from staging to storage handoff points |

The repository has no code, package, migration, or history dependency on another physical-AI repository. Existing research repositories remain unchanged.

Normal operation requires no model, API key, GPU, ROS, Docker, cloud account or hosted project storage. The application and its required assets are bundled for local operation.

## Specification documents

All five documents below are normative parts of this written specification. They elaborate the approved design and are included in the pending written-spec review.

| Document | Covers |
| --- | --- |
| [Product and interfaces](robopomelo/product-and-interfaces.md) | Guided reasoning, 11 screens, terminal wizard, CLI, exports, first-run behavior |
| [Specification and validation](robopomelo/specification-and-validation.md) | Records, knowledge states, units, rule catalogue, approvals, patches, hashes |
| [Runtime, security, and updates](robopomelo/runtime-security-updates.md) | Packages, transactions, concurrency, evidence, permissions, network boundary, updater |
| [Delivery and roadmap](robopomelo/delivery-and-roadmap.md) | Governance, bootstrap, CI, accessibility, releases, documentation, future gates |
| [Decision record](robopomelo/decision-record.md) | Approved choices and superseded requirements |

## End-to-end product journey

1. Launch the local browser application or terminal wizard.
2. Create a blank project, open a project folder, or copy the fictional example.
3. Work through the five planning steps. Answer engineering challenge questions and preserve explicit unknowns.
4. Link needs and problems to workflows, KPIs, requirements, risks, and acceptance tests.
5. Review the readable document, validation findings, traceability, and unresolved issues.
6. Generate a review package, including an engineering handoff and selected evidence.
7. Obtain the warehouse operator's decision outside or inside the local workflow. Record its provenance and the reviewed content.
8. Give the package to engineers preparing simulation, detailed design, vendor configuration, or site work using their chosen tools.

Engineers still supply real geometry, robot models, configurations, and operational evidence. Isaac Sim, Gazebo, and vendor tools do not natively execute RoboPomelo's planning YAML. Simulator-specific conversion is future work.

## Core promises

- JSON Schema is the language-neutral contract; YAML is the normal human-authored format.
- `deployment.yaml` is the single source of truth. History snapshots are recovery records; exports are derived views.
- Stable IDs connect needs, problems, workflows, challenges, risks, assumptions, requirements, KPIs, tests, evidence, decisions, and approvals.
- Units and measurement methods are explicit. Missing, unknown, unverified, and not-applicable are distinct.
- Namespaced extensions survive supported read/write/export cycles without silently acquiring core meaning.
- One deterministic core serves browser actions, CLI commands, and Skills.
- Every generated artifact identifies its source revision/hash and relevant tool, schema, and rule versions.
- Project data stays in portable folders. Authorization does not travel with a copied project.
- The browser autosaves incomplete drafts. Stale writes cannot silently overwrite another writer.
- Full workflows are available through browser, composable CLI commands, and an interactive terminal wizard.

## Readiness and human decisions

RoboPomelo reports exactly three specification-readiness labels:

- Specification ready for review.
- Specification ready with warnings.
- Specification blocked.

Readiness is separate from operator approval. Any active blocker means blocked. Warnings remain visible and require structured acknowledgment before an approval can be recorded. Only catalogue entries explicitly marked waivable can be waived.

Documented open issues may remain in a reviewable specification when they have owners and next actions and no blocking rule applies. Adding an owner does not clear a blocker. The core checks document structure, traceability, and declared requirements; it cannot establish that a real-world risk is acceptable.

Operator decisions record reviewer, recorder, role, date, reviewed planning hash, evidence reference, and warning acknowledgments. Identity is asserted, not verified. Material changes invalidate prior approval. Approval records remain in history.

## Agent autonomy

Autonomous editing is the recommended mode. A user authorizes a project's editing scope, and the machine remembers that grant until forgotten or revoked. An optional review-each-change mode retains individual patch review.

Agents can use structured patches and noninteractive commands for authorized planning work. The core still validates operation scope, source revision, schema structure, and reference integrity, and records diffs and recoverable revisions. Incomplete drafts can be persisted while readiness remains blocked.

Editing authority does not include inventing operator acceptance, accepting warnings on another person's behalf, changing protected review obligations, or waiving blockers. Explicitly supplied human decisions can be recorded with provenance under separate decision-recording authority.

No local software can prove a human used the CLI when an agent has unrestricted shell/filesystem access. RoboPomelo documents its application-level safeguards without claiming stronger identity enforcement.

## Outputs

The primary export is a downloadable ZIP with `deployment.yaml`, `deployment-brief.md`, `acceptance-plan.md`, `validation-report.json`, print-ready HTML, `engineering-handoff.md`, a manifest, and selected attachments. Individual files can also be exported.

The handoff identifies intended scenarios, constraints, tests, unresolved questions, and missing engineering assets. Unknown geometry, robot configuration, or measurements remain unknown. The package must not look like a verified simulator configuration.

Planning evidence supports current claims or decisions. Future acceptance-evidence requirements describe what must later be collected. V1 has no test-run recorder or results assessor; those are explicit roadmap capabilities.

## Release and operating boundaries

The first complete package is `1.0.0-rc.1`; after distributed-package checks pass, release `1.0.0` under Hansel's execution authorization. No customer-discovery gate precedes the full v1 build. Documentation states that workflow fit remains unvalidated.

Automatic compatible stable updates are the default. Users can select notify-only, off, or a version pin. Updates occur between sessions, preserve the current installation on failure, and support rollback. Breaking upgrades and project migrations require explicit authorization. Release candidates and unstable capabilities require explicit selection.

RoboPomelo does not call models, upload project data, use telemetry/analytics, or load remote frontend assets. Update metadata and package downloads are the narrow network exception; fully offline operation disables it. Users may independently use cloud-backed agents under the agent host's permissions.

## V1 exclusions

AI note extraction; hosted collaboration; a hosted application; 2D layout editing; capacity modeling; simulation execution; vendor selection; electronic signatures; commissioning; safety certification; robot control; facility-system access; automatic reconciliation or writes into physical systems; a supported public TypeScript SDK.

RoboPomelo never claims physical safety, expected or achieved performance, ROI achievement, regulatory approval, engineering approval, or production readiness.

## Execution authorization and review sequence

Hansel is lead maintainer. Public contributions go through issues and PRs. Further maintainers are appointed explicitly after earning trust.

After written-spec review and implementation planning, the implementation agent handles checks, branch commits, pushes, PRs, merges, release workflows, and synchronization without asking Hansel to approve individual PRs. Automated quality gates remain required.

Work starts on a `chore/`, `feat/`, or `fix/` branch. Never commit on `main`. Establish protected `main` from the bootstrap commit before feature work. Completion requires a clean canonical working tree and equal local-main/live-remote-main hashes, plus actual publication verification when reporting a release.

No repository or npm availability is reserved by this specification. Recheck names and account capabilities immediately before bootstrap. Authentication or service-side authorization that the agent cannot perform remains an external dependency, not a claimed completed step.
