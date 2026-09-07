import { build } from 'esbuild';
import { build as buildWeb } from 'vite';
import { resolve } from 'node:path';
import { buildParser } from './build-parser.mjs';
const root = resolve(import.meta.dirname, '../..');
for (const name of ['main', 'preload', 'parser-preload']) {
  await build({
    entryPoints: [resolve(root, 'apps/desktop/src/' + name + '.ts')],
    outfile: resolve(root, 'apps/desktop/dist/' + name + '.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  });
}
await buildParser(root);
await buildWeb({
  root: resolve(root, 'apps/web'),
  build: { outDir: resolve(root, 'apps/desktop/dist/ui'), emptyOutDir: true },
  logLevel: 'warn',
});
console.log('Built desktop main, sandbox preload and shared local UI.');
