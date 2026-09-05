# RoboPomelo Skills

The six Skills guide a user-selected agent through the same CLI and deterministic core used by the application. They contain instructions and contracts, not another planning engine. RoboPomelo does not launch a model to execute them.

## Capability map

| Skill                                                                   | Intended work                                                  | Dependencies       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------ |
| [frame-robot-deployment](../skills/frame-robot-deployment/SKILL.md)     | Frame scope, needs, problems and people                        | None               |
| [specify-material-flow](../skills/specify-material-flow/SKILL.md)       | Describe current/intended flow and exceptions                  | Frame              |
| [define-deployment-kpis](../skills/define-deployment-kpis/SKILL.md)     | Define success measures and measurement context                | Frame, flow        |
| [specify-amr-requirements](../skills/specify-amr-requirements/SKILL.md) | Connect capability requirements, rationale and proposed issues | Flow, KPIs         |
| [design-acceptance-plan](../skills/design-acceptance-plan/SKILL.md)     | Plan tests, criteria and future evidence                       | Requirements, KPIs |
| [plan-amr-deployment](../skills/plan-amr-deployment/SKILL.md)           | Coordinate the five narrow Skills and revisit dependencies     | All five           |

The exact write sets live in each `contract.json` and the [capability registry](../packages/spec/src/capabilities.ts). A Skill may read the specification under inspection authority while writing only its declared collections. The orchestrator's set is the union of the narrow sets. A wildcard does not bypass immutable IDs or protected decision fields.

## Format and versioning

Each directory contains standard `SKILL.md` frontmatter and a local `contract.json`. The frontmatter names the Skill, its trigger and namespaced string metadata pointing to the contract. This follows the [open Agent Skills format](https://agentskills.io/specification), checked on 2026-09-05.

Contracts declare inputs, field access, dependencies, supported spec/CLI/patch ranges, CLI command templates, validation, stop conditions and output fields. They cannot grant application or host permissions. The [contract schema](../skills/contract.schema.json) is bundled for validation.

The current contracts target spec and patch `^1.0.0` and CLI `>=1.0.0-rc.1 <2.0.0`. Check the actual installed CLI and capability response. The package, schemas and Skills follow one coordinated release; these ranges are not proof of publication.

Schemas remain at `packages/spec/schemas` in both source and packaged runtime layouts. Keep the bundle's relative layout when using its links. If a host copies a Skill to a different location, supply the matching installed schemas explicitly. Do not substitute another runtime's schemas or invent a schema-discovery command.

## Execution and authority

The caller selects the project and supplies facts and authority. Each generated patch carries the exact current base, an agent recorder and its declared `capabilityId`. The agent uses `patch check`, `patch diff` and `patch apply`, then reads the resulting source. It does not edit `deployment.yaml` directly.

Existing grants or exact caller-supplied one-run scopes govern application. A Skill must not add authorization, save a grant or treat `--yes` as consent. Unsupported capabilities, malformed input, stale bases and missing authority stop dependent writes. Missing facts stay null/unknown with an actionable question. Independent work can continue.

Autonomous mode can apply authorized valid patches. Review-each-change mode creates proposals and pauses dependent writes until an authorized caller applies them. A proposal is not the next committed base. Backlinks may require revisiting a prior narrow Skill after later records have been created. A blocked readiness result does not invalidate a successful draft save.

Skills keep decisions proposed and use separate supplied workflows for protected decision records. They do not fabricate measurements, waivers, attestations, executed tests or operator acceptance. No Skill issues robot/facility commands or enables a roadmap adapter.

## Verification

```sh
npm run check:skills
npm test -- tests/skills
```

The checker validates format and contracts against real registry fields and CLI commands. Adversarial fixtures cover expanded scopes, self-granted flags, incompatible ranges, invented commands and dependency errors. The subprocess replay uses actual source CLI parsing/dispatch, JSON envelopes and storage for five steps, fresh-base backlinks, stale rejection and proposal application.

These deterministic tests supply fictional facts. They neither run a model nor prove that an agent follows instructions under pressure. The subprocess driver injects an isolated config directory and a fixture CLI version; it is not an installed-package or native host integration test. Record those separate outcomes using the [compatibility guide](agent-compatibility.md).
