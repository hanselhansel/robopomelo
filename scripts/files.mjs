import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const excluded = new Set(['.git', '.worktrees', 'node_modules', 'dist', 'coverage', 'playwright-report', 'test-results']);
export function selectedRoot() {
  const args = process.argv.slice(2);
  if (!args.length) return process.cwd();
  if (args.length !== 2 || args[0] !== '--root') throw new Error('Usage: --root <directory>');
  return resolve(args[1]);
}
export async function files(root, path = '') {
  const out = [];
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const name = path ? `${path}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await files(root, name));
    else if (entry.isFile()) out.push(name);
  }
  return out.sort();
}
export function finish(errors, success) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  if (errors.length) process.exitCode = 1;
  else process.stdout.write(`${success}\n`);
}
