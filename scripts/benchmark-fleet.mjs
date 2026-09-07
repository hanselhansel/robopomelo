// S6 fleet benchmark host. Bundles the TypeScript probe and the simulation
// worker entry side by side (the runner resolves ./worker-entry.mjs next to
// itself), then runs the probe with the caller's arguments:
//   node scripts/benchmark-fleet.mjs --fixture fixtures/fleet-50.json --report test-results/fleet-benchmark.json
// Exit code 1 when a measured target fails. Unmeasured renderer targets are reported as such.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const out = await mkdtemp(join(tmpdir(), 'rp-fleet-benchmark-'));
try {
  await build({
    entryPoints: { 'fleet-benchmark': resolve(import.meta.dirname, 'probe/fleet-benchmark.ts'), 'worker-entry': resolve(import.meta.dirname, '../packages/application/src/simulation/worker-entry.ts') },
    outdir: out, bundle: true, platform: 'node', format: 'esm', target: 'node22', outExtension: { '.js': '.mjs' },
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
  });
  const result = spawnSync(process.execPath, [join(out, 'fleet-benchmark.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm(out, { recursive: true, force: true }); }
