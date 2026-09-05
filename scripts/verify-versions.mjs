import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { artifactVersion } from './release-manifest.mjs';

export async function verifyVersions(root) {
  const target = (await readFile(join(root, 'VERSION'), 'utf8')).trim();
  artifactVersion(target, 'stable');
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  if (manifest.name !== '@robopomelo/workspace' || manifest.private !== true)
    throw new Error('Release source must remain a private workspace.');
  if ([manifest.version, lock.version, lock.packages?.['']?.version].some((v) => v !== target))
    throw new Error('VERSION, root manifest and lock must be synchronized.');
  return target;
}
export function assertReleaseContext(c) {
  if (!['bootstrap', 'publish'].includes(c.mode)) throw new Error('Choose bootstrap or publish mode.');
  if (c.target === '0.0.0' || c.version !== artifactVersion(c.target, c.channel))
    throw new Error('Artifact must match the committed nonzero release target.');
  if (c.mode === 'bootstrap' && c.channel !== 'candidate')
    throw new Error('Bootstrap signs candidates only.');
  const e = c.environment;
  if (
    e.GITHUB_ACTIONS !== 'true' ||
    e.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    e.GITHUB_REPOSITORY !== 'hanselhansel/robopomelo' ||
    e.GITHUB_REF !== 'refs/heads/main' ||
    e.GITHUB_WORKFLOW_REF !== 'hanselhansel/robopomelo/.github/workflows/release.yml@refs/heads/main' ||
    e.RUNNER_ENVIRONMENT !== 'github-hosted'
  )
    throw new Error('Release requires the authorized main workflow dispatch.');
  if (
    !/^[a-f0-9]{40}$/.test(c.expectedCommit) ||
    [c.head, c.remoteMain, e.GITHUB_SHA].some((v) => v !== c.expectedCommit) ||
    c.dirty
  )
    throw new Error('Release requires clean exact HEAD, dispatch SHA and live main.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        root: { type: 'string', default: '.' },
        release: { type: 'boolean' },
        version: { type: 'string' },
        commit: { type: 'string' },
        channel: { type: 'string' },
        mode: { type: 'string' },
      },
    });
    const root = resolve(values.root),
      target = await verifyVersions(root);
    if (values.release) {
      const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
      assertReleaseContext({
        target,
        version: values.version,
        channel: values.channel,
        mode: values.mode,
        expectedCommit: values.commit,
        head: git(['rev-parse', 'HEAD']),
        remoteMain: git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0],
        dirty: git(['status', '--porcelain']).length > 0,
        environment: process.env,
      });
    }
    process.stdout.write(`Version identity verified: ${target}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
