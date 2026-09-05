# CI and release contract

This document describes the executable gates. It does not record a successful remote run. Local structural tests cannot establish native Windows, Linux, hosted runner, trusted-publisher, Safari or VoiceOver acceptance.

## Source and distribution gates

[CI](../../.github/workflows/ci.yml) runs on every pull request, main push and explicit dispatch. It also supplies the same gates to the release workflow. It has no path filter. `required-ci` requires successful `source`, `native` and `browser` results. The aggregate always runs and rejects missing, skipped, cancelled and failed jobs. A cancelled workflow cannot count as a successful required check.

Source checks cover strict types, tooling, dependency boundaries, source limits, documentation links, six Skill contracts, the plan-to-test presence map, synchronized root version metadata, Changeset intent and unit coverage. The presence map catches missing entry points. It does not replace test execution or measure behavioral coverage.

[Distribution](../../.github/workflows/distribution.yml) runs native Ubuntu 24.04, Windows 2025, macOS 15 arm64 and macOS 15 Intel at Node 22.22.2, current Node 22, Node 24.15.0 and current Node 24 (16 legs). Each leg records actual OS, architecture and Node version, runs storage/security/CLI/Skills/update tests and installs the packed standalone package into isolated temporary paths. The package verifier exercises init, validation, exports and loopback HTTP. Each leg also prepares the pinned test-only node-pty driver and runs the actual terminal handshake, five-step navigation, durable edit, ZIP export and clean exit. The native driver is excluded from the published runtime. No Docker or WSL result substitutes for a native leg. Matrix failure does not cancel remaining evidence collection.

All Windows runtime legs also install and exercise actual Chrome and Edge binaries. The Linux browser job builds the actual package and runs its Chromium, Firefox and WebKit projects, including offline/outbound checks. Browser engines are installed only into the test environment. Hosted Chrome and Edge outcomes require actual Windows runs. Native Safari and VoiceOver acceptance remain separate evidence. WebKit is not recorded as Safari. HTML reports and runtime results are uploaded even after a failing test; absent artifacts fail the upload.

## Version and publication gates

[Version guard](../../scripts/verify-versions.mjs) checks the stable three-part `VERSION` against the private root manifest and both root lock entries. CI may build the approved candidate target 1.0.0 while development metadata remains 0.0.0. Publication has no such override: the committed nonzero target must derive the requested artifact identity.

[Release](../../.github/workflows/release.yml) is explicit `workflow_dispatch` only. Supply mode `bootstrap` or `publish`, channel `candidate` or `stable`, exact artifact version and full main commit. The guard requires the authorized repository, main ref, clean checkout and agreement among dispatch SHA, HEAD, supplied commit and live main. It repeats immediately before signing or publishing. Source, native and browser checks must all pass first. A later main advance causes the recheck to fail.

`bootstrap` is candidate-only. It uses the coordinator's pinned official npm provenance generator to sign the packed candidate in the authorized GitHub-hosted release job. The generated tarball must match the fresh package-verification digest. The workflow uploads the tarball, Sigstore provenance and manifest without publishing. A maintainer must verify those exact bytes and provenance before the authenticated first publication using `npm publish --provenance-file`. No npm credential is transferred into GitHub. Package ownership, account setup and bootstrap verification remain actual external release dependencies.

`publish` requires configured npm trusted publishing for the exact repository and release workflow. OIDC write permission exists only in the delivery job. Candidate publication uses `candidate`; stable publication uses `verification`. The published-artifact verifier then checks the registry package, provenance, expected source commit and independently installed commands. A failure preserves evidence and stops the workflow. The workflow never publishes or moves `latest`. Promotion remains a separate authenticated operation using fresh verification of the exact stable artifact.

Required release results include guard, verification and delivery. Selecting bootstrap deliberately performs signing instead of registry publication; it does not skip an applicable acceptance gate or certify that the package exists.

## Reviewed Action pins

The coordinator verified these versions on 2026-09-05. Workflows use full immutable commits, not moving tags.

| Action          | Version | Commit                                     |
| --------------- | ------- | ------------------------------------------ |
| checkout        | 7.0.1   | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| setup-node      | 7.0.0   | `820762786026740c76f36085b0efc47a31fe5020` |
| upload-artifact | 7.0.1   | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |

No workflow uses `pull_request_target`, npm token secrets or checkout-persisted credentials. Fork source checks get read-only repository permission. Hosted execution and package publication must be reported from actual run and registry evidence, not this configuration.
