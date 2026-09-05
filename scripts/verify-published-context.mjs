import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { verifyVersions } from './verify-versions.mjs';
import { artifactVersion } from './release-manifest.mjs';

// Read-only verification identity. This does not grant signing or publication authority.
export function assertPublishedContext(c) {
  if (
    !['candidate', 'stable'].includes(c.channel) ||
    c.target === '0.0.0' ||
    c.version !== artifactVersion(c.target, c.channel)
  )
    throw new Error('Published artifact must match the committed nonzero release target.');
  const e = c.environment;
  if (
    e.GITHUB_ACTIONS !== 'true' ||
    e.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    e.GITHUB_REPOSITORY !== 'hanselhansel/robopomelo' ||
    e.GITHUB_REF !== 'refs/heads/main' ||
    e.GITHUB_WORKFLOW_REF !== 'hanselhansel/robopomelo/.github/workflows/published.yml@refs/heads/main' ||
    e.RUNNER_ENVIRONMENT !== 'github-hosted'
  )
    throw new Error('Published verification requires the authorized main workflow dispatch.');
  if (
    !/^[a-f0-9]{40}$/.test(c.expectedCommit) ||
    [c.head, c.remoteMain, e.GITHUB_SHA].some((v) => v !== c.expectedCommit) ||
    c.dirty
  )
    throw new Error('Published verification requires clean exact HEAD, dispatch SHA and live main.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        root: { type: 'string', default: '.' },
        version: { type: 'string' },
        commit: { type: 'string' },
        channel: { type: 'string' },
      },
    });
    const root = resolve(values.root);
    const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    assertPublishedContext({
      target: await verifyVersions(root),
      version: values.version,
      channel: values.channel,
      expectedCommit: values.commit,
      head: git(['rev-parse', 'HEAD']),
      remoteMain: git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0],
      dirty: git(['status', '--porcelain']).length > 0,
      environment: process.env,
    });
    process.stdout.write('Published verification source identity verified.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
