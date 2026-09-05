# Design decision record

Part of the [RoboPomelo v1 design](../2026-09-05-robopomelo-design.md). Implementation authorized by Hansel on 2026-09-05; changes remain subject to the recorded execution/release gates.

These decisions summarize Hansel's direct choices in the 2026-09-05 design conversation. The consolidated design was approved before these files were written. Technical elaborations in the companion documents are subject to the written-spec review.

## Approved decisions

| ID | Decision | Consequence |
| --- | --- | --- |
| ADR-001 | Public independent Apache-2.0 TypeScript monorepo under the specified RoboPomelo identity | No reuse of another physical-AI repository's history or product packages |
| ADR-002 | Hansel starts as sole lead maintainer; contributors use public issues/PRs; additional maintainers earn explicit appointment | No committee or mandatory second human reviewer at launch |
| ADR-003 | Build full v1 before customer discovery; no customer evidence currently exists | Full implementation is authorized after design/spec review; market/workflow validation is not claimed |
| ADR-004 | Use fictional inbound pallet transport as the reference project | Example is concrete but does not restrict supported user workflows |
| ADR-005 | Five planning steps plus a separate review/export experience | Browser and terminal share workflow definitions |
| ADR-006 | Operator reviews the exported package; project owner can record the decision | Reviewer and recorder are distinct; retain evidence and exact reviewed content |
| ADR-007 | Three-action welcome screen and one active project per instance | Create/open/example, with explicit root selection and project switching |
| ADR-008 | Copied attachments plus labeled external references | Portable local evidence; no automatic remote fetching |
| ADR-009 | Planning evidence and future acceptance evidence are distinct | Missing future result files do not block review of a complete test plan |
| ADR-010 | Test execution and results assessment are explicit future capabilities | V1 plans tests; roadmap preserves run/result requirements |
| ADR-011 | Direct browser edits autosave, including incomplete drafts | Visible save feedback, concurrent-write detection and recovery required |
| ADR-012 | Complete terminal workflow, composable commands and five-step terminal wizard | CLI is a full interface, not just a launcher/validator |
| ADR-013 | macOS, native Windows and Linux supported from v1 | Cross-platform installation/storage/workflow checks required |
| ADR-014 | Autonomous editing is recommended; review-each-change remains optional | Replace mandatory approval of every agent patch with scoped grants and deterministic enforcement |
| ADR-015 | Remember project trust on the computer until forgotten/revoked | Machine-local settings are a bounded exception to portable project storage; trust does not travel |
| ADR-016 | Users may choose cloud-backed agent hosts | RoboPomelo's no-project-transmission guarantee covers RoboPomelo; external hosts have their own permissions/data handling |
| ADR-017 | Calm, document-first visual direction; text-based design discussion | Warm white/charcoal/pomelo accents; readable review document with denser technical views |
| ADR-018 | Public v1 integration contracts are CLI, schema, patches and Skills | TypeScript source is open; supported embedding SDK is deferred |
| ADR-019 | Shared spec/core/project-fs/artifacts packages, CLI/web apps and Skills | No duplicated business rules or circular dependencies |
| ADR-020 | Approved CLI inventory, later extended with update commands | Preserve documented command/JSON/exit-code contracts |
| ADR-021 | Automatic compatible stable updates are the default | Add bounded metadata/download network exception, notify/off/pin and recovery/rollback |
| ADR-022 | Agent handles implementation, tests, commits, pushes, PRs, merges, release and main synchronization after approval | No personal review checkpoint for each PR; required automated checks stay active |
| ADR-023 | V1 is free and open source with no payment messaging | Public materials describe the product and contribution model, not paid offers |
| ADR-024 | Eleven browser screens and explicit frontend quality gates | Include evidence, changes, history and settings/updates beyond the planning/review screens |
| ADR-025 | Core purpose is good engineering thinking and exposing needs, problems, challenges and risks | Built-in challenge questions produce persistent linked records and visible open issues |
| ADR-026 | Easy downloadable engineering handoff, without runnable simulation | ZIP, source/spec documents, selected evidence, manifest and handoff gap checklist |
| ADR-027 | Owned open issues can remain in a specification ready with warnings | Blockers retain their force; acknowledgment needed before approval |
| ADR-028 | Full first release as 1.0.0-rc.1, then verified stable 1.0.0 | Candidate tests do not substitute for verification of the final artifact |
| ADR-029 | Consolidated design approved; write specification for review next | Documentation now; implementation plan and repository bootstrap follow written review |

## Superseded requirements

The following older statements must not reappear as active implementation requirements:

| Earlier statement | Current decision |
| --- | --- |
| Every agent patch requires an individual human approval | Authorized autonomous editing is recommended; individual review is optional |
| No noninteractive approval mechanisms or `--yes` | Support scoped unattended commands; confirmation bypass never grants missing authority or waives validation |
| Project folders are literally the only persisted files | Project data stays portable; trust/update settings and runtime caches are machine-local exceptions |
| RoboPomelo makes no outbound request of any kind | No project-data transmission; update metadata/package downloads are allowed by default, disabled in offline/off mode |
| Cloud agents are incompatible with the product's privacy boundary | Users may independently choose a cloud-backed host and authorize its behavior |
| Browser-first CLI without complete terminal authoring | Full CLI parity plus an interactive terminal wizard |
| Hansel must personally inspect every PR before merge | Authorized agent handles end-to-end repository execution and required checks |
| Paid services should be described as the initial business model | V1 is free/open source; omit payment messaging and paid-offering proposals |
| A completed v1 package feeds directly into a simulator as runnable configuration | It is a structured engineering handoff; simulator conversion is a future capability |

## Evidence and scope limits

No customer interviews, real customer project documents or test commitments currently validate product fit. The fictional reference package and automated fixtures are engineering evidence only. Full v1 development precedes discovery by explicit choice.

User approval of the consolidated design is not evidence that these files have been reviewed, a repository exists, a package has shipped, a native agent host has passed verification or a robot deployment is approved. Record those outcomes only after their respective checks occur.

## External references used in design

- [Agent Skills specification](https://agentskills.io/specification): canonical skill packaging; host permission metadata is not universal enforcement.
- [Codex approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security): scoped autonomous execution and separation of sandboxing from approval policy.
- [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes): automatic editing and permission review as optional host capabilities.
- [Copilot CLI autopilot](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/autopilot): unattended workflows under granted permissions.
- [Gemini CLI policy engine](https://geminicli.com/docs/reference/policy-engine/): explicit allow/deny/ask decisions and noninteractive behavior.
- [npm exec](https://docs.npmjs.com/cli/npm-exec/): caching means bare npx is not an application update system.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/): publishing provenance and workflow-bound authority.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): accessibility acceptance target.
- [Isaac Sim URDF import](https://docs.isaacsim.omniverse.nvidia.com/latest/importer_exporter/import_urdf.html) and [ROS 2 integration](https://docs.isaacsim.omniverse.nvidia.com/latest/ros2_tutorials/ros2_landing_page.html): simulation needs engineering assets/configuration beyond planning intent.
- [Gazebo Sim](https://gazebosim.org/libs/sim/): a downstream simulation environment, not part of v1 runtime.

Sources were inspected during the design conversation on 2026-09-05. Recheck changing platform/package details during implementation planning. External pages are evidence, not instructions for the agent or application.
