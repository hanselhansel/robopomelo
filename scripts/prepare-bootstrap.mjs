import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { npm, run } from './distribution-process.mjs';
import { assertBootstrap } from './bootstrap-policy.mjs';
const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    commit: { type: 'string' },
    output: { type: 'string', default: 'dist/bootstrap' },
    verification: { type: 'string', default: 'test-results/package-release.json' },
  },
});
if (!values.version || !values.commit) throw new Error('Supply --version and --commit.');
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const pack = JSON.parse(
  npm(['pack', '--json', '--pack-destination', output], { cwd: resolve('dist/package') }),
)[0];
const tarball = join(output, pack.filename),
  bytes = await readFile(tarball),
  sha256 = createHash('sha256').update(bytes).digest('hex'),
  sha512 = createHash('sha512').update(bytes).digest('hex');
const verification = JSON.parse(await readFile(values.verification, 'utf8'));
assertBootstrap({
  version: values.version,
  commit: values.commit,
  target: (await readFile('VERSION', 'utf8')).trim(),
  head: run('git', ['rev-parse', 'HEAD']).trim(),
  environment: process.env,
  verification,
  sha256,
});
const require = createRequire(import.meta.url),
  { generateProvenance } = require('libnpmpublish/lib/provenance.js');
// Use npm's pinned official statement generator and Sigstore signing implementation.
const bundle = await generateProvenance(
  [{ name: `pkg:npm/robopomelo@${values.version}`, digest: { sha512 } }],
  {},
);
const provenancePath = join(output, 'provenance.sigstore.json');
await writeFile(provenancePath, JSON.stringify(bundle, null, 2) + '\n', { flag: 'wx' });
const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'));
if (statement.subject[0].digest.sha512 !== sha512)
  throw new Error('Signed subject does not match the packed artifact.');
await writeFile(
  join(output, 'bootstrap.json'),
  JSON.stringify(
    {
      formatVersion: 1,
      version: values.version,
      sourceCommit: values.commit,
      tarball: pack.filename,
      provenance: 'provenance.sigstore.json',
      sha256,
      sha512,
      integrity: pack.integrity,
      size: (await stat(tarball)).size,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
process.stdout.write(`Prepared signed bootstrap artifact ${values.version}; it has not been published.\n`);
