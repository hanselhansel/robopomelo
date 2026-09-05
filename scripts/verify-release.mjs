import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import semver from 'semver';
import { run, workspaceRoot } from './distribution-process.mjs';
const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    commit: { type: 'string' },
    report: { type: 'string' },
    'expect-latest': { type: 'boolean' },
  },
});
if (
  !values.version ||
  !semver.valid(values.version) ||
  !values.commit ||
  !/^[0-9a-f]{40}$/.test(values.commit)
)
  throw new Error('Supply --version and exact --commit for public release verification.');
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'robopomelo-release-'))),
  probe = join(temporary, 'probe.mjs');
await build({
  entryPoints: [join(workspaceRoot, 'scripts/verify-published.ts')],
  outfile: probe,
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
  logLevel: 'silent',
});
const { verifiedPublished } = await import(pathToFileURL(probe).href);
// Verification uses the same signature, identity, archive and cache policy as installed updates.
const published = await verifiedPublished(values.version, join(temporary, 'verified-cache'));
assert.equal(
  published.receipt.sourceCommit,
  values.commit,
  'Published provenance must identify the expected source commit.',
);
const packageReport = join(temporary, 'installed.json');
run(
  process.execPath,
  [
    join(workspaceRoot, 'scripts/verify-package.mjs'),
    '--package',
    published.runtime.directory,
    '--tarball',
    published.tarball,
    '--report',
    packageReport,
  ],
  { cwd: workspaceRoot, timeout: 120000 },
);
const installed = JSON.parse(await readFile(packageReport, 'utf8'));
assert.equal(installed.tarballSha256, published.receipt.sha256);
if (values['expect-latest']) {
  const response = await fetch('https://registry.npmjs.org/robopomelo/latest', {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  const latest = await response.json();
  assert.equal(latest.version, values.version);
  assert.equal(latest.dist.integrity, published.metadata.integrity);
}
const proof = {
  formatVersion: 1,
  status: 'passed',
  verifiedAt: new Date().toISOString(),
  version: values.version,
  sourceCommit: values.commit,
  integrity: published.metadata.integrity,
  sha256: published.receipt.sha256,
  identity: published.receipt.identity,
  manifestDigest: published.runtime.manifestDigest,
  checks: installed.checks,
  latestVerified: values['expect-latest'] === true,
  platform: { os: process.platform, arch: process.arch, node: process.version },
};
if (values.report) {
  await mkdir(dirname(resolve(values.report)), { recursive: true });
  await writeFile(values.report, JSON.stringify(proof, null, 2) + '\n');
}
process.stdout.write(JSON.stringify(proof, null, 2) + '\n');
