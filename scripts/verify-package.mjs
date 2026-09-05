import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { inventory } from './release-manifest.mjs';
import { npm, run, launchJson } from './distribution-process.mjs';
const { values } = parseArgs({
  options: {
    package: { type: 'string', default: 'dist/package' },
    report: { type: 'string' },
    tarball: { type: 'string' },
  },
});
const directory = resolve(values.package),
  metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(directory, 'runtime-manifest.json'), 'utf8'));
assert.equal(metadata.name, 'robopomelo');
assert.equal(manifest.version, metadata.version);
assert.deepEqual(manifest.files, await inventory(directory));
assert.equal(manifest.skills.length, 6);
assert.ok(manifest.webAssets.includes('ui/index.html'));
assert.equal(metadata.dependencies, undefined, 'The installed runtime must be self-contained.');
for (const file of manifest.files)
  assert.ok(!/(?:^|\/)(?:\.env|node_modules|\.git|test-results)(?:\/|$)/.test(file.path));
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'robopomelo-package-')));
const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', temporary], { cwd: directory }))[0];
const tarball = values.tarball ? resolve(values.tarball) : join(temporary, packed.filename),
  installed = join(temporary, 'installed');
await mkdir(installed);
assert.deepEqual(
  packed.files.map((file) => file.path).sort(),
  [...manifest.files.map((file) => file.path), 'runtime-manifest.json'].sort(),
);
npm(['install', '--prefix', installed, '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
  cwd: temporary,
});
const env = {
  ...process.env,
  ROBOPOMELO_CONFIG_DIR: join(temporary, 'config'),
  ROBOPOMELO_CACHE_DIR: join(temporary, 'cache'),
};
const entry = join(installed, 'node_modules', 'robopomelo', 'bin', 'robopomelo.mjs');
const cli = (args) =>
  JSON.parse(run(process.execPath, [entry, ...args, '--offline', '--json'], { cwd: temporary, env }));
const version = cli(['--version']);
assert.equal(version.data.selectedRuntimeVersion, metadata.version);
// npm exec exercises the package's declared bin from a fresh installed directory.
const npxVersion = JSON.parse(
  npm(['exec', '--offline', '--', 'robopomelo', '--version', '--offline', '--json'], { cwd: installed, env }),
);
assert.equal(npxVersion.data.launcherVersion, metadata.version);
const project = join(temporary, 'project');
assert.equal(
  cli(['init', project, '--example', 'inbound-pallet', '--authorize', 'author', '--yes']).ok,
  true,
);
assert.equal(cli(['validate', '--project', project]).ok, true);
const exported = cli([
  'export',
  '--project',
  project,
  '--format',
  'files',
  '--no-evidence',
  '--authorize',
  'export',
  '--yes',
]);
assert.equal(exported.ok, true);
assert.equal(exported.data.memberCount, 7);
const artifacts = join(project, exported.data.path);
for (const name of [
  'deployment.yaml',
  'deployment-brief.md',
  'acceptance-plan.md',
  'validation-report.json',
  'review.html',
  'engineering-handoff.md',
  'manifest.json',
])
  assert.ok((await stat(join(artifacts, name))).size > 0);
const server = launchJson(process.execPath, [entry, 'open', project, '--no-browser', '--offline', '--json'], {
  cwd: temporary,
  env,
});
try {
  const launched = await server.ready;
  assert.equal(launched.ok, true, JSON.stringify({ errors: launched.errors, command: launched.command }));
  const bootstrap = new URL(launched.data.bootstrapUrl),
    origin = bootstrap.origin;
  assert.equal(bootstrap.hostname, '127.0.0.1');
  const html = await fetch(origin);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /RoboPomelo|root/);
  const sessionResponse = await fetch(origin + '/api/session', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: bootstrap.hash.slice(1) }),
  });
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  assert.ok(session.data.credential, 'Bootstrap session returns a protected local session.');
  const review = await fetch(origin + '/api/project/review', {
    headers: {
      Origin: origin,
      Authorization: `Bearer ${session.data.credential}`,
      'X-RP-Project-Epoch': session.data.projectEpoch,
    },
  });
  assert.equal(review.status, 200);
  assert.equal((await review.json()).ok, true);
} finally {
  await server.close();
}
const report = {
  verifiedAt: new Date().toISOString(),
  version: metadata.version,
  os: process.platform,
  arch: process.arch,
  node: process.version,
  tarballIntegrity:
    'sha512-' +
    createHash('sha512')
      .update(await readFile(tarball))
      .digest('base64'),
  tarballSha256: createHash('sha256')
    .update(await readFile(tarball))
    .digest('hex'),
  checks: [
    'manifest inventory',
    'packed inventory',
    'isolated install',
    'npm exec bin',
    'offline version',
    'example creation',
    'validation',
    'seven artifact export',
    'packaged HTTP launch',
  ],
  temporaryDirectory: temporary,
};
if (values.report) {
  await mkdir(resolve(values.report, '..'), { recursive: true });
  await writeFile(values.report, JSON.stringify(report, null, 2) + '\n');
}
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
