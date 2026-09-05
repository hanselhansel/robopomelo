import { build } from 'esbuild';
import { mkdtemp, realpath, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const { values } = parseArgs({
  options: {
    package: { type: 'string', default: 'dist/package' },
    report: { type: 'string', default: 'test-results/launcher-profile.json' },
    samples: { type: 'string', default: '6' },
  },
});
const samples = Number(values.samples);
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 20)
  throw new Error('Choose 1 to 20 launch samples.');
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'rp-probe-build-')));
try {
  const modulePath = join(temporary, 'probe.mjs');
  await build({
    entryPoints: ['scripts/probe-launcher.ts'],
    outfile: modulePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    banner: { js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);" },
    logLevel: 'silent',
  });
  const { probeLauncher } = await import(pathToFileURL(modulePath).href);
  let report;
  try {
    report = await probeLauncher(resolve(values.package), samples);
  } catch (error) {
    report = { status: 'failed', code: error.code ?? 'PROBE_FAILED', details: error.details ?? null };
  }
  await mkdir(dirname(resolve(values.report)), { recursive: true });
  await writeFile(values.report, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.status !== 'within-budget') process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
