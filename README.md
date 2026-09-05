# RoboPomelo

An open-source local tool for thinking through warehouse AMR deployments and producing a traceable engineering handoff.

Check [published versions on npm](https://www.npmjs.com/package/robopomelo) for release availability. The npm commands below apply to published releases; the source-build path works independently.

RoboPomelo provides a local browser application, a CLI and five-step terminal wizard, and model-agnostic Agent Skills. It helps engineers expose needs, problems, challenges and risks; define material flows, KPIs and requirements; and prepare acceptance plans and portable review packages.

## Start a local workspace

Use Node 22.22.2 or newer on the Node 22 line, or Node 24.15.0 or newer on the Node 24 line.

```sh
npx robopomelo
```

The application opens a local browser workspace. Choose a new folder, an existing project, or the fictional inbound-pallet example. Project files stay in that folder. No model, API key, GPU, ROS, Docker, cloud account or Git installation is required.

Automatic compatible stable updates are enabled by default. Use `--offline` to disable release-network access for a run, or change the policy in Settings. Initial package acquisition is handled by npm.

## Make a first engineering handoff

Run these commands from a folder where `demo` does not already contain files:

```sh
npx robopomelo init demo --example inbound-pallet --authorize author --yes
npx robopomelo show --project demo
npx robopomelo validate --project demo
npx robopomelo export --project demo --format files --no-evidence --authorize export --yes
```

The example is fictional and intentionally retains unknowns and warnings. Validation reports specification readiness, not physical deployment readiness. The export command returns its directory under `demo/exports/`; open that directory's `review.html` to read or print the handoff.

Continue in the browser with `npx robopomelo open demo`, or in a terminal with `npx robopomelo plan demo`. The terminal wizard requires an interactive terminal. Use `--json` on finite commands for structured agent/tool output. `--yes` never grants permissions or operator approval.

## What the package contains

- `deployment.yaml`: the source specification, stable IDs and explicit knowledge states.
- `deployment-brief.md`: needs, outcomes, flows, requirements and open issues.
- `acceptance-plan.md`: future procedures, criteria, evidence requirements and approvers.
- `validation-report.json`: stable RP rule findings and source identity.
- `review.html`: a readable, print-ready document.
- `engineering-handoff.md`: inputs and unresolved work for the next engineer or simulation team.
- `manifest.json`: source revision/hash and member integrity.

The browser can download the package as a ZIP with explicitly selected evidence. V1 plans acceptance tests; later versions will record test execution and result assessment. Simulation adapters and runnable robot environments are future work.

## Use your preferred agent

Five narrow Skills and the `plan-amr-deployment` orchestrator use the open Agent Skills format. They propose bounded patches that the same deterministic core checks. Host support and verification limits are documented in [agent compatibility](docs/agent-compatibility.md). No model or host owns RoboPomelo's business rules.

## Build from source

After obtaining this independent repository:

```sh
npm ci --ignore-scripts
npm run build
node dist/package/bin/robopomelo.mjs --offline
```

The generated package lives in `dist/package`. Build tools and test-only browser/terminal drivers are development dependencies, not requirements for the installed runtime. See [Testing](TESTING.md) and [Contributing](CONTRIBUTING.md).

Read the [CLI reference](docs/cli.md), [terminal guide](docs/terminal-guide.md), [storage and recovery guide](docs/project-storage.md), [update policy](docs/update-policy.md), and [security boundaries](docs/security-boundaries.md).

Read the [approved design](docs/superpowers/specs/2026-09-05-robopomelo-design.md), [original implementation plan](docs/superpowers/plans/2026-09-05-robopomelo-v1.md), [visual system](DESIGN.md), and [delivery roadmap](docs/superpowers/specs/robopomelo/delivery-and-roadmap.md).

Maintainers can follow the [release guide](docs/releasing.md), inspect the [CI contract](docs/verification/ci-contract.md), and review the dated [local acceptance evidence](docs/verification/v1-local-acceptance.md). These records distinguish local verification from hosted checks and publication.

See the [release notes](CHANGELOG.md) for the changes prepared for each version and [early implementation record](docs/verification/implementation-progress.md) for historical evidence.

RoboPomelo is free and open source under Apache-2.0. It does not control robots or certify a deployment's physical safety or performance.
