import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const directory = await realpath(await mkdtemp(join(tmpdir(), 'robopomelo-benchmark-run-'))),
  entry = join(directory, 'run.mjs');
await build({
  entryPoints: ['scripts/benchmark-planning.ts'],
  outfile: entry,
  bundle: true,
  platform: 'node',
  format: 'esm',
  banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
  logLevel: 'silent',
});
const { benchmarkPlanning } = await import(pathToFileURL(entry).href);
process.stdout.write(JSON.stringify(await benchmarkPlanning('test-results/benchmark.json'), null, 2) + '\n');
