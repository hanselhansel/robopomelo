import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runSmokeProcess } from './smoke-process.mjs';
const require = createRequire(import.meta.url);
await build({
  entryPoints: [resolve(import.meta.dirname, 'parser-smoke.ts')],
  outfile: resolve(import.meta.dirname, 'dist/parser-smoke.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
});
try {
  await runSmokeProcess(require('electron'), [resolve(import.meta.dirname, 'dist/parser-smoke.cjs')], {
    timeoutMs: 60000,
    onOutput: (chunk) => process.stdout.write(chunk),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
