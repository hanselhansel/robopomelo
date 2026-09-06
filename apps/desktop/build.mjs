import { build } from 'esbuild';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
for (const name of ['main', 'preload']) {
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
console.log('Built desktop main and sandbox preload. Shared UI remains apps/web.');
