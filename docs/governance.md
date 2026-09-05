# Governance

## Maintainer authority

Hansel, [@hanselhansel](https://github.com/hanselhansel), is the initial lead maintainer. He holds final authority over merges, releases, specification changes, roadmap and maintainer appointments.

Public issues and pull requests are the contribution path. Additional maintainers earn an explicit appointment after sustained contributions that demonstrate technical judgment, careful review, dependable follow-through and respect for project boundaries. An appointment states its scope. Repository access, a contribution count or an agent's recommendation does not appoint a maintainer.

Maintainers may delegate bounded review or execution work to people or agents. Delegation does not waive tests, security findings, source-state checks or release verification. CODEOWNERS routes review; it does not grant merge authority or bypass protections.

## Decisions and review

Prefer decisions that name the user problem, alternatives, evidence, compatibility effects and operating consequences. Keep ordinary discussion public. Keep vulnerability details and confidential material in an appropriate private channel.

Public-contract and broad architecture changes require an ADR. Schema and rule changes require a compatibility decision and affected fixtures. Capability changes update the registry, documentation and tests together. A roadmap entry is not an implemented capability or permission to enable it.

Work reaches main through a pull request. Applicable checks must pass for the intended source state. Canceled, unexpectedly skipped or missing required checks do not count as success. Do not keep standing bypass permissions for automation.

Initially, there is no mandatory second human approving reviewer. Outside contributions receive maintainer or explicitly authorized review. The maintainer can delegate implementation and repository execution to an agent without personally reviewing every PR. Release gates remain binding.

## Contribution terms

RoboPomelo uses Apache-2.0 and DCO 1.1 sign-offs. No separate CLA is required. Contributors retain responsibility for the rights and provenance of submitted work, including AI-assisted work. See the [contributor guide](contributing.md#license-and-sign-off).

## Release and scope policy

The runtime, schemas, browser, CLI and bundled Skills follow one release train. `specVersion` describes the project format and is distinct from the package version. Prerelease artifacts and synthetic update fixtures must be labeled accurately. Publication is established by registry and installed-package verification, not a version string in a source file.

RoboPomelo remains a local planning and handoff tool in v1. It does not operate robots, certify physical safety or execute acceptance tests. Future Git/MCP, geometry, capacity, simulator/interface, results and production-evidence work keeps its separate entry and exit gates in the [roadmap](superpowers/specs/robopomelo/delivery-and-roadmap.md#future-capability-gates).

Full v1 precedes product discovery. Prioritization after release follows [observed practitioner and handoff evidence](customer-discovery.md), without treating fictional fixtures as customers.
