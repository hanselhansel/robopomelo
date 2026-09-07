import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const out = await mkdtemp(join(tmpdir(), 'rp-probe-'));
try {
  await build({ entryPoints: [resolve(import.meta.dirname, 'probe/fleet-feasibility.ts')], outfile: join(out, 'probe.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22' });
  const result = spawnSync(process.execPath, [join(out, 'probe.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm(out, { recursive: true, force: true }); }
