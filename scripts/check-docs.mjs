import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { files, selectedRoot, finish } from './files.mjs';
const root = selectedRoot();
const errors = [];
for (const path of await files(root)) {
  if (!path.endsWith('.md')) continue;
  const text = await readFile(resolve(root, path), 'utf8');
  for (const match of text.matchAll(/\]\((<?[^)]+>?)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z]+:/i.test(target) || target.startsWith('/')) continue;
    try { await stat(resolve(root, dirname(path), decodeURIComponent(target))); }
    catch { errors.push(`${path}: missing local link ${target}`); }
  }
}
finish(errors, 'Local documentation links passed.');
