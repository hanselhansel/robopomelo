# Contributor guide

RoboPomelo turns planning intent into a structured specification and engineering handoff. Changes must preserve unknowns, source identities, human decision records and the boundary between planning and physical operation.

## Propose a change

Use the repository's public issues and pull requests for ordinary contributions. A useful proposal identifies a concrete workflow, its current failure and the resulting behavior. Include a small reproduction or an observable acceptance criterion.

For specification, patch, CLI, Skill or capability changes, describe compatibility and migration impact. Schema or rule changes need affected fixtures. Broad architecture or public-contract changes need an ADR before implementation. Proposed future capabilities stay unavailable until their implementation and verification gates pass.

Do not add a model dependency, hidden telemetry, remote UI assets, robot commands or automatic connections to facility systems. The planned future phases are recorded in the [roadmap](superpowers/specs/robopomelo/delivery-and-roadmap.md#future-capability-gates).

## License and sign-off

The repository uses [Apache-2.0](../LICENSE). Submit only material that you have the right to contribute under those terms. Identify the source and license of third-party material; do not copy incompatible code or confidential customer artifacts into a patch.

Each contribution commit needs a sign-off under the [Developer Certificate of Origin 1.1](https://developercertificate.org/). Read the certificate before signing. The sign-off is your certification about the contribution and your right to submit it. It also becomes part of the public contribution record.

Configure your own contributor identity and use:

```sh
git commit -s
```

This adds a `Signed-off-by` trailer from your Git identity. Do not sign for another person or add their trailer without authorization. No separate CLA is required. This policy does not rewrite earlier repository history or imply that earlier commits already carry sign-offs.

## Work locally

Use the Node version range in [package.json](../package.json) and install the locked development dependencies with `npm ci`. Git and development dependencies are contributor tools. Normal RoboPomelo use does not require Git, a compiler, a model API or a GPU.

Read [AGENTS.md](../AGENTS.md). Use a `feat/`, `fix/` or `chore/` branch. Do not commit directly to main, reset unrelated work or force-push to obtain a clean tree. Keep authored source files below 400 lines after formatting. Commit each meaningful green change.

Use the smallest relevant checks during development, then run the applicable shared gates:

```sh
npm run typecheck
npm test
npm run check:boundaries
npm run check:source-lines
npm run check:docs
npm run check:skills
```

CLI changes need JSON, exit-code, closed-stdin and actual persistence tests. Storage changes need real files and failure cases. UI changes need browser, keyboard, focus and accessibility evidence. A simulated WebKit run is not a native Safari or screen-reader test. Skills need [contract and orchestration checks](skills.md#verification).

The release owner also runs build, packed-package, native-platform and release verification. A local unit pass does not establish an installed package, publication or deployment result.

## Prepare a pull request

Lead with the problem and resulting behavior. Include relevant validation and its limits, compatibility decisions, a changeset when release behavior changes, and screenshots only when they explain the change. Preserve the original reproduction if a test or implementation changed during repair.

AI-assisted submissions must be understood by their contributor. Name meaningful generated or third-party sources and verify the resulting behavior. Tests must exercise outcomes and boundaries, not merely repeat implementation details. An agent's confidence is not test evidence.

Use fictional fixtures or obtain permission to share sanitized inputs. Remove facility identifiers, personal information, credentials and bootstrap/session secrets. Do not attach a full project ZIP by default. Follow the [security reporting policy](../SECURITY.md) for suspected vulnerabilities.

## Review and maintenance

Hansel is lead maintainer. Review can be delegated explicitly, including execution by an agent. Applicable checks and unresolved high-impact findings remain binding. No second human approving reviewer is required by the initial governance model, but outside contributions still require maintainer or authorized review.

Small bug fixes and documentation improvements are welcome. Maintainer appointments are separate decisions based on sustained trusted work. See [governance](governance.md) and the [post-release learning protocol](customer-discovery.md).
