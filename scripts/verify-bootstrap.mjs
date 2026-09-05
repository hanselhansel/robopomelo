import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { run, workspaceRoot } from './distribution-process.mjs';
const { values } = parseArgs({ options: { directory: { type: 'string' }, commit: { type: 'string' } } });
if (!values.directory || !values.commit || !/^[a-f0-9]{40}$/.test(values.commit))
  throw new Error('Supply bootstrap --directory and expected --commit.');
const directory = resolve(values.directory),
  manifest = JSON.parse(await readFile(join(directory, 'bootstrap.json'), 'utf8'));
assert.equal(manifest.formatVersion, 1);
assert.equal(manifest.sourceCommit, values.commit);
assert.match(manifest.version, /^\d+\.\d+\.\d+-rc\.1$/);
assert.equal(manifest.tarball, `robopomelo-${manifest.version}.tgz`);
assert.equal(manifest.provenance, 'provenance.sigstore.json');
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'robopomelo-bootstrap-'))),
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
const { verifiedBootstrap } = await import(pathToFileURL(probe).href);
const tarball = join(directory, manifest.tarball),
  bundle = JSON.parse(await readFile(join(directory, manifest.provenance), 'utf8'));
const verified = await verifiedBootstrap(manifest, tarball, bundle, join(temporary, 'cache'));
assert.equal(verified.receipt.sourceCommit, values.commit);
assert.equal(verified.receipt.sha256, manifest.sha256);
assert.equal(verified.receipt.sha512, manifest.sha512);
run(
  process.execPath,
  [
    join(workspaceRoot, 'scripts/verify-package.mjs'),
    '--package',
    verified.runtime.directory,
    '--tarball',
    tarball,
    '--report',
    join(temporary, 'installed.json'),
  ],
  { cwd: workspaceRoot, timeout: 120000 },
);
const proof = {
  ...manifest,
  verifiedAt: new Date().toISOString(),
  status: 'passed',
  identity: verified.receipt.identity,
  checks: JSON.parse(await readFile(join(temporary, 'installed.json'), 'utf8')).checks,
};
await writeFile(join(directory, 'verified-bootstrap.json'), JSON.stringify(proof, null, 2) + '\n');
process.stdout.write(JSON.stringify(proof, null, 2) + '\n');
