import { build as bundle } from 'esbuild';
import { build as buildWeb } from 'vite';
import { mkdir, readFile, writeFile, cp, rm, stat, readdir, chmod } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { artifactVersion, inventory, makeManifest } from './release-manifest.mjs';
const { values } = parseArgs({
  options: { target: { type: 'string' }, channel: { type: 'string' }, 'skip-web': { type: 'boolean' } },
});
const root = process.cwd(),
  target = values.target ?? (await readFile('VERSION', 'utf8')).trim();
const channel = values.channel ?? (target === '0.0.0' ? 'stable' : 'candidate');
const version = artifactVersion(target, channel),
  output = resolve('dist/package');
if (JSON.parse(await readFile('package.json', 'utf8')).name !== '@robopomelo/workspace')
  throw new Error('Build must run from the RoboPomelo workspace root.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const banner = "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);";
const entries = [
  ['apps/cli/src/main.ts', 'runtime/main.mjs'],
  ['apps/cli/src/launcher-main.ts', 'bin/robopomelo.mjs'],
];
const inputs = new Set();
for (const [entry, file] of entries) {
  await stat(entry);
  await mkdir(dirname(join(output, file)), { recursive: true });
  const built = await bundle({
    entryPoints: [entry],
    outfile: join(output, file),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    metafile: true,
    banner: { js: (file.startsWith('bin/') ? '#!/usr/bin/env node\n' : '') + banner },
    define: { __ROBOPOMELO_VERSION__: JSON.stringify(version) },
    logLevel: 'warning',
  });
  for (const input of Object.keys(built.metafile.inputs)) inputs.add(input);
  if (file.startsWith('bin/')) await chmod(join(output, file), 0o755);
}
if (!values['skip-web'])
  await buildWeb({
    root: resolve('apps/web'),
    build: { outDir: join(output, 'ui'), emptyOutDir: true },
    logLevel: 'warn',
  });
else await cp('apps/web/dist', join(output, 'ui'), { recursive: true });
for (const [source, destination] of [
  ['LICENSE', 'LICENSE'],
  ['README.md', 'README.md'],
  ['packages/spec/schemas', 'packages/spec/schemas'],
  ['skills', 'skills'],
  ['examples', 'examples'],
])
  await cp(source, join(output, destination), { recursive: true });
const dependencies = new Set();
for (const input of inputs) {
  const match = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(input);
  if (match) dependencies.add(match[1]);
}
const licenses = [];
for (const name of [...dependencies].sort()) {
  const folder = join(root, 'node_modules', name),
    manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
  let licenseFolder = folder;
  if (name === '@sigstore/verify') licenseFolder = join(root, 'packaging/license-overrides/sigstore-verify');
  const files = (await readdir(licenseFolder)).filter((name) =>
    /^(license|licence|copying|notice)(\.|$)/i.test(name),
  );
  if (!files.length) throw new Error(`Bundled dependency lacks a license notice: ${name}`);
  const destination = join(output, 'licenses', name.replaceAll('/', '__').replace('@', ''));
  await mkdir(destination, { recursive: true });
  for (const file of files) await cp(join(licenseFolder, file), join(destination, file));
  licenses.push({ name, version: manifest.version, license: manifest.license, notices: files });
}
await writeFile(join(output, 'licenses', 'index.json'), JSON.stringify(licenses, null, 2) + '\n');
await writeFile(
  join(output, 'package.json'),
  JSON.stringify(
    {
      name: 'robopomelo',
      version,
      description: 'Local, open-source AMR deployment planning and engineering handoff',
      license: 'Apache-2.0',
      type: 'module',
      bin: { robopomelo: 'bin/robopomelo.mjs' },
      engines: { node: '^22.22.2 || ^24.15.0' },
      repository: { type: 'git', url: 'https://github.com/hanselhansel/robopomelo.git' },
      files: [
        'bin',
        'runtime',
        'ui',
        'packages/spec/schemas',
        'skills',
        'examples',
        'licenses',
        'runtime-manifest.json',
        'README.md',
        'LICENSE',
      ],
      publishConfig: { access: 'public' },
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  join(output, 'runtime-manifest.json'),
  JSON.stringify(makeManifest(version, channel, await inventory(output)), null, 2) + '\n',
);
process.stdout.write(`Built robopomelo ${version} at dist/package\n`);
