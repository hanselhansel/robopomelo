import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), 'robopomelo-check-'));
  for (const [name, value] of Object.entries(files)) {
    await mkdir(join(root, name, '..'), { recursive: true });
    await writeFile(join(root, name), value);
  }
  return root;
}
async function run(script, files) {
  const root = await fixture(files);
  try { return spawnSync(process.execPath, [resolve('scripts', script), '--root', root], { encoding: 'utf8' }); }
  finally { await rm(root, { recursive: true, force: true }); }
}
test('source limit accepts 399 lines and excludes generated output', async () => {
  const r = await run('check-source-lines.mjs', { 'packages/core/src/a.ts': 'x\n'.repeat(399), 'dist/a.js': 'x\n'.repeat(700) });
  assert.equal(r.status, 0, r.stderr);
});
test('source limit rejects 400 lines with the path', async () => {
  const r = await run('check-source-lines.mjs', { 'apps/cli/src/a.ts': 'x\n'.repeat(400) });
  assert.equal(r.status, 1); assert.match(r.stderr, /apps\/cli\/src\/a.ts.*400/);
});
test('dependency checks reject core side effects and reverse dependencies', async () => {
  const r = await run('check-boundaries.mjs', { 'packages/core/src/a.ts': "import fs from 'node:fs';\nimport '@robopomelo/project-fs';\n" });
  assert.equal(r.status, 1); assert.match(r.stderr, /core.*node:fs/s); assert.match(r.stderr, /project-fs/);
});
test('dependency checks allow declared pure dependencies', async () => {
  const r = await run('check-boundaries.mjs', { 'packages/core/src/a.ts': "import type { Id } from '@robopomelo/spec';\n", 'packages/spec/src/a.ts': 'export type Id = string;\n' });
  assert.equal(r.status, 0, r.stderr);
});
test('docs checker permits external links without fetching and rejects missing local files', async () => {
  const r = await run('check-docs.mjs', { 'README.md': '[offline](docs/missing.md) [web](https://invalid.example)\n' });
  assert.equal(r.status, 1); assert.match(r.stderr, /docs\/missing.md/);
});
test('docs checker accepts relative targets and fragment-only links', async () => {
  const r = await run('check-docs.mjs', { 'README.md': '[guide](docs/guide.md#example) [local](#local)\n', 'docs/guide.md': '# Example\n' });
  assert.equal(r.status, 0, r.stderr);
});
