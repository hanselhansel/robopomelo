import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
await build({
  entryPoints: [resolve(import.meta.dirname, 'runtime-smoke.ts')],
  outfile: resolve(import.meta.dirname, 'dist/smoke.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
});
const child = spawn(require('electron'), [resolve(import.meta.dirname, 'dist/smoke.cjs')], {
  stdio: 'inherit',
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
