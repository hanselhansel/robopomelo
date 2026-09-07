import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, realpath, rm, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { runSmokeProcess } from './smoke-process.mjs';
const require = createRequire(import.meta.url);
await build({
  entryPoints: [resolve(import.meta.dirname, 'application-smoke.ts')],
  outfile: resolve(import.meta.dirname, 'dist/application-smoke.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
});
const base = await realpath(await mkdtemp(join(tmpdir(), 'rp-desktop-app-')));
try {
  for (const mode of ['window', 'app']) {
    await runSmokeProcess(
      require('electron'),
      [resolve(import.meta.dirname, 'dist/application-smoke.cjs'), base, mode],
      {
        onOutput: (chunk) => process.stdout.write(chunk),
      },
    );
  }
  const evidence = resolve(import.meta.dirname, '../../test-results/desktop-smoke');
  await mkdir(evidence, { recursive: true });
  await copyFile(join(base, 'workspace.png'), join(evidence, 'workspace.png'));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await rm(base, { recursive: true, force: true });
}
