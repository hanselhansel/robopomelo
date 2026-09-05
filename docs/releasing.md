# Releasing RoboPomelo

RoboPomelo deploys as an npm package that launches a local application. There is no hosted application production URL. This guide describes the approved first release, `1.0.0-rc.1` followed by `1.0.0`. Commands are a procedure, not evidence that either artifact has been published.

The [CI contract](verification/ci-contract.md) defines the executable gates. The [local acceptance record](verification/v1-local-acceptance.md) records local results and the manual screen-reader test explicitly deferred for v1. That exception does not waive any other release gate or establish WCAG conformance.

## Prepare the exact source

Complete the reviewed pull request and require successful hosted `required-ci`, including source, native and browser jobs. Missing, cancelled or unexpectedly skipped required checks fail the gate. The configured 16 native legs and Windows Chrome/Edge checks count only when they run successfully.

Merge through the protected pull request, then fast-forward the clean canonical checkout on main. Compare local HEAD, cached origin/main and live main. Preserve unrelated state and stop on conflict. Do not reset, force-push or select another release version to work around a failure.

Use Node 24.20.0 and npm 11.19.0 for this release. Confirm the active binaries; an older npm may lack `npm trust`. From the canonical repository checkout:

```sh
node --version
npm --version
git status --short
git branch --show-current
git rev-parse HEAD origin/main
git ls-remote origin refs/heads/main
node scripts/verify-versions.mjs
npm ci --ignore-scripts
RP_RELEASE_COMMIT=$(git rev-parse HEAD)
RP_RELEASE_ARTIFACTS=$(mktemp -d "${TMPDIR:-/tmp}/robopomelo-release.XXXXXX")
```

Require branch main, a clean release checkout, identical source commits and synchronized `VERSION`, root manifest and lock metadata at `1.0.0`. Keep the full commit and evidence directory for all following steps. Do not advance main during release: the workflow compares the supplied commit, dispatch SHA, checkout HEAD and live main before verification and again before signing or publishing.

## Sign the first candidate

Dispatch the candidate-only bootstrap operation:

```sh
gh workflow run release.yml --repo hanselhansel/robopomelo --ref main -f mode=bootstrap -f channel=candidate -f version=1.0.0-rc.1 -f commit="$RP_RELEASE_COMMIT"
gh run list --repo hanselhansel/robopomelo --workflow release.yml --event workflow_dispatch --commit "$RP_RELEASE_COMMIT" --json databaseId,createdAt,status,conclusion,url
```

Select this dispatch's run ID as `RP_BOOTSTRAP_RUN`. Inspect the run's inputs if more than one run exists for that commit. Require successful guard, verification, delivery and `required-release` results:

```sh
gh run watch "$RP_BOOTSTRAP_RUN" --repo hanselhansel/robopomelo --exit-status
gh run download "$RP_BOOTSTRAP_RUN" --repo hanselhansel/robopomelo --name release-1.0.0-rc.1-bootstrap --dir "$RP_RELEASE_ARTIFACTS"
```

Set `RP_BOOTSTRAP_DIR` to the downloaded directory containing `bootstrap.json`. It also contains the candidate tarball and `provenance.sigstore.json`. The workflow signs the packed candidate with the pinned npm provenance generator and uploads those files without publishing.

Keep the original bytes. Do not repack, regenerate provenance locally, invoke `prepare-bootstrap.mjs` locally or invent GitHub signing environment values.

## Verify and publish those original bytes

The maintainer needs npm package-publishing authority and account-level two-factor authentication. An account challenge requires the actual account holder. Do not transfer an npm credential into GitHub.

```sh
node scripts/verify-bootstrap.mjs --directory "$RP_BOOTSTRAP_DIR" --commit "$RP_RELEASE_COMMIT"
npm publish "$RP_BOOTSTRAP_DIR/robopomelo-1.0.0-rc.1.tgz" --provenance-file "$RP_BOOTSTRAP_DIR/provenance.sigstore.json" --access public --tag candidate
node scripts/verify-release.mjs --version 1.0.0-rc.1 --commit "$RP_RELEASE_COMMIT" --report "$RP_RELEASE_ARTIFACTS/rc-published.json"
npm view robopomelo dist-tags --json
```

Run each step only after the preceding one passes. Bootstrap verification checks publisher identity, signature, source commit, archive integrity and installation of the original tarball. It writes `verified-bootstrap.json` beside `bootstrap.json`; it accepts `--directory` and `--commit`, not `--version` or `--report`.

Require the registry verifier to pass for the exact candidate and source commit, and require `candidate` to resolve to `1.0.0-rc.1`. Preserve the existing `latest` state. If publication returns an ambiguous result, inspect registry state before retrying. An immutable-version collision or account error stops publication.

Verify that actual published candidate on the supported native matrix before stable publication:

```sh
gh workflow run published.yml --repo hanselhansel/robopomelo --ref main -f channel=candidate -f version=1.0.0-rc.1 -f commit="$RP_RELEASE_COMMIT"
gh run list --repo hanselhansel/robopomelo --workflow published.yml --event workflow_dispatch --commit "$RP_RELEASE_COMMIT" --json databaseId,createdAt,status,conclusion,url
```

Select this dispatch's run as `RP_CANDIDATE_VERIFY_RUN`, inspect its inputs, then wait:

```sh
gh run watch "$RP_CANDIDATE_VERIFY_RUN" --repo hanselhansel/robopomelo --exit-status
```

Require successful `required-published` and retain its native installation reports. This gate installs the registry artifact; the earlier source distribution matrix built its own packages and cannot establish this result.

## Configure trusted publishing

After the real package exists, configure and read back the exact publisher:

```sh
npm trust github robopomelo --file release.yml --repo hanselhansel/robopomelo --allow-publish --yes
npm trust list robopomelo --json
```

Require repository `hanselhansel/robopomelo`, workflow `release.yml` and direct publication permission. The workflow declares no GitHub environment, so this configuration supplies no environment flag. `--yes` does not replace an authentication challenge. Trusted publication uses GitHub's short-lived identity authorization; it does not provide authority for the later maintainer dist-tag operation.

## Publish and verify stable

Read live main again and require it to equal `RP_RELEASE_COMMIT`. Then dispatch stable from that same approved source:

```sh
git ls-remote origin refs/heads/main
gh workflow run release.yml --repo hanselhansel/robopomelo --ref main -f mode=publish -f channel=stable -f version=1.0.0 -f commit="$RP_RELEASE_COMMIT"
gh run list --repo hanselhansel/robopomelo --workflow release.yml --event workflow_dispatch --commit "$RP_RELEASE_COMMIT" --json databaseId,createdAt,status,conclusion,url
```

Select this dispatch's run ID as `RP_STABLE_RUN`. The workflow repeats the applicable gates for the stable artifact and publishes it under `verification`. It never publishes or moves `latest`.

```sh
gh run watch "$RP_STABLE_RUN" --repo hanselhansel/robopomelo --exit-status
node scripts/verify-release.mjs --version 1.0.0 --commit "$RP_RELEASE_COMMIT" --report "$RP_RELEASE_ARTIFACTS/stable-published.json"
npm view robopomelo dist-tags --json
```

Require passing `required-release`, exact registry provenance and integrity, independently installed commands and protected local HTTP launch. A source build, Git tag or workflow configuration cannot substitute for those results.

Verify the actual stable registry artifact on the supported native matrix before promotion:

```sh
gh workflow run published.yml --repo hanselhansel/robopomelo --ref main -f channel=stable -f version=1.0.0 -f commit="$RP_RELEASE_COMMIT"
gh run list --repo hanselhansel/robopomelo --workflow published.yml --event workflow_dispatch --commit "$RP_RELEASE_COMMIT" --json databaseId,createdAt,status,conclusion,url
```

Select and inspect this dispatch as `RP_STABLE_VERIFY_RUN`, then require successful `required-published`:

```sh
gh run watch "$RP_STABLE_VERIFY_RUN" --repo hanselhansel/robopomelo --exit-status
```

Preserve the reports for the exact stable version and source commit. A passing candidate matrix does not substitute for this stable artifact check.

## Promote and check the default install

After the stable native matrix passes, produce fresh stable proof. The promotion guard requires proof less than one hour old.

```sh
node scripts/verify-release.mjs --version 1.0.0 --commit "$RP_RELEASE_COMMIT" --report "$RP_RELEASE_ARTIFACTS/stable-published.json"
node scripts/promote-release.mjs --version 1.0.0 --commit "$RP_RELEASE_COMMIT" --proof "$RP_RELEASE_ARTIFACTS/stable-published.json"
node scripts/verify-release.mjs --version 1.0.0 --commit "$RP_RELEASE_COMMIT" --expect-latest --report "$RP_RELEASE_ARTIFACTS/latest-published.json"
npm view robopomelo@1.0.0 version dist.integrity dist.attestations --json
npm view robopomelo dist-tags --json
git rev-parse HEAD origin/main
git ls-remote origin refs/heads/main
git status --short
```

The promotion guard binds the exact version, commit and integrity to passing installed-package proof, requires the local HTTP launch check, rejects stale proof or replacement of a newer `latest`, changes the tag and reads it back. Do not bypass it with a raw dist-tag command.

The final verifier checks `latest` against the exact stable integrity and performs a fresh isolated installation. This is the package deployment health check. Record its report, actual workflow URLs and final local/live main equality before claiming release completion. Retain failure evidence and stop when a required check fails.

For later releases, use a reviewed stable target and its derived candidate identity under the same gates. Do not reuse these first-release version numbers or assume an existing trusted-publisher configuration remains correct without readback.
