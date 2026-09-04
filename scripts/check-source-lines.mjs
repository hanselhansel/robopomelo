import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { files, selectedRoot, finish } from './files.mjs';
const root = selectedRoot();
const errors = [];
for (const path of await files(root)) {
  if (!/\.(?:[cm]?[jt]sx?|css|json|ya?ml)$/.test(path) || path === 'package-lock.json') continue;
  const text = await readFile(join(root, path), 'utf8');
  const count = text === '' ? 0 : text.split('\n').length - Number(text.endsWith('\n'));
  if (count >= 400) errors.push(`${path}: ${count} lines; split authored files below 400.`);
}
finish(errors, 'Source line limits passed.');
