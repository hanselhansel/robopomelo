import { artifactVersion } from './release-manifest.mjs';
export function assertBootstrap({
  version,
  commit,
  target,
  head,
  environment,
  verification,
  sha256,
  now = Date.now(),
}) {
  if (version !== artifactVersion(target, 'candidate'))
    throw new Error('Bootstrap is restricted to the coordinated release candidate.');
  if (!/^[a-f0-9]{40}$/.test(commit) || head !== commit || environment.GITHUB_SHA !== commit)
    throw new Error('Bootstrap source must match the exact checked main commit.');
  if (
    environment.GITHUB_ACTIONS !== 'true' ||
    environment.GITHUB_REPOSITORY !== 'hanselhansel/robopomelo' ||
    environment.GITHUB_REF !== 'refs/heads/main' ||
    environment.GITHUB_WORKFLOW_REF !==
      'hanselhansel/robopomelo/.github/workflows/release.yml@refs/heads/main' ||
    environment.RUNNER_ENVIRONMENT !== 'github-hosted'
  )
    throw new Error('Bootstrap signing requires the authorized GitHub-hosted main release workflow.');
  const age = now - Date.parse(verification?.verifiedAt);
  if (
    verification?.version !== version ||
    verification.tarballSha256 !== sha256 ||
    !verification.checks?.includes('packaged HTTP launch') ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 3600000
  )
    throw new Error('Bootstrap requires fresh verification of the exact tarball bytes.');
}
