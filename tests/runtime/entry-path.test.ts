import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { expect, test } from 'vitest';
import { fixtureEntry } from './helpers/entry-path.js';

test('bundles a fixture from a native path containing spaces and Unicode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fixture path é '));
  try {
    const entry = join(root, 'child process.ts');
    await writeFile(entry, 'export const value: number = 42;');
    const actual = fixtureEntry('./child process.ts', pathToFileURL(join(root, 'parent.ts')));
    expect(actual).toBe(entry);
    const result = await build({ entryPoints: [actual], bundle: true, platform: 'node', write: false });
    expect(result.outputFiles[0]?.text).toContain('42');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
