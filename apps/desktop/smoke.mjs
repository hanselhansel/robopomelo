import { build } from 'esbuild';
import { runSmokeProcess } from './smoke-process.mjs';
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
try {
  await runSmokeProcess(require('electron'), [resolve(import.meta.dirname, 'dist/smoke.cjs')], {
    onOutput: (chunk) => process.stdout.write(chunk),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
