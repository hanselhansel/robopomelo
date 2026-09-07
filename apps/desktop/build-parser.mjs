import { build } from 'esbuild';
import { mkdir, copyFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
export async function buildParser(root) {
  const output = resolve(root, 'apps/desktop/dist/parser');
  await mkdir(output, { recursive: true });
  await build({
    entryPoints: [resolve(root, 'apps/desktop/src/parser-renderer.ts')],
    outfile: join(output, 'renderer.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'chrome140',
  });
  const pdf = resolve(root, 'node_modules/pdfjs-dist');
  await copyFile(join(pdf, 'build/pdf.worker.mjs'), join(output, 'worker.mjs'));
  await copyFile(join(pdf, 'LICENSE'), join(output, 'PDFJS-LICENSE'));
  const assets = ['renderer.js', 'worker.mjs'];
  for (const [from, to] of [
    ['standard_fonts', 'fonts'],
    ['cmaps', 'cmaps'],
  ]) {
    await mkdir(join(output, to), { recursive: true });
    for (const entry of await readdir(join(pdf, from), { withFileTypes: true })) {
      if (!entry.isFile() || !/^[a-zA-Z0-9_.-]+$/.test(entry.name)) continue;
      await copyFile(join(pdf, from, entry.name), join(output, to, entry.name));
      assets.push(to + '/' + entry.name);
    }
  }
  await writeFile(join(output, 'assets.json'), JSON.stringify(assets));
  await writeFile(
    join(output, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><title>Attachment parser</title></head><body><script type="module" src="renderer.js"></script></body></html>',
  );
}
