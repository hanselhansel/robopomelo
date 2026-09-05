import { afterEach, expect, it, vi } from 'vitest';
import type { BigIntStats } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSelection } from '../../packages/project-fs/src/evidence/selection.js';

const metadata = vi.hoisted(() => ({ path: '', pinned: undefined as BigIntStats | undefined }));
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return {
    ...fs,
    lstat: async (...args: Parameters<typeof fs.lstat>) => {
      const result = await fs.lstat(...args);
      if (String(args[0]) === metadata.path) metadata.pinned ??= result as BigIntStats;
      return result;
    },
    open: async (...args: Parameters<typeof fs.open>) => {
      const handle = await fs.open(...args);
      if (String(args[0]) === metadata.path)
        vi.spyOn(handle, 'stat').mockImplementation((async () => metadata.pinned!) as typeof handle.stat);
      return handle;
    },
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  metadata.path = '';
  metadata.pinned = undefined;
});
it.each(['inspect', 'stream'] as const)(
  'rejects changed selected bytes during %s even when file metadata is unchanged',
  async (operation) => {
    const directory = await mkdtemp(join(tmpdir(), 'rp-selection-content-'));
    const path = join(directory, 'selected.txt');
    await writeFile(path, 'before');
    metadata.path = path;
    const selection = await FileSelection.open(path);
    try {
      await writeFile(path, 'after!');
      const consume = async () => {
        if (operation === 'inspect') return selection.inspect();
        for await (const _bytes of selection.stream()) { /* consume the entire selected stream */ }
      };
      await expect(consume()).rejects.toMatchObject({ code: 'SELECTION_CHANGED' });
    } finally {
      await selection.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
