import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdtemp,
  realpath,
  writeFile,
  mkdir,
  rename,
  symlink,
  truncate,
  rm,
  lstat,
  utimes,
  open,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SafeRoot } from '@robopomelo/project-fs';
import { readSelectedFile, snapshotSelectedFile } from '../../apps/desktop/src/selected-file.js';
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'selected-file-')));
  roots.push(root);
  const parent = join(root, 'selected');
  await mkdir(parent);
  const path = join(parent, 'plan.png');
  await writeFile(path, 'original');
  return { root, parent, path };
}
it('reads the exact explicit selection without exposing path or directory authority', async () => {
  const { path, parent } = await fixture();
  const selection = await snapshotSelectedFile(path);
  expect(selection).toEqual({ displayName: 'plan.png', byteLength: 8 });
  expect(Object.isFrozen(selection)).toBe(true);
  expect(JSON.stringify(selection)).not.toContain(parent);
  expect(new TextDecoder().decode(await readSelectedFile(selection))).toBe('original');
  await expect(readSelectedFile({ ...selection })).rejects.toMatchObject({
    code: 'ATTACHMENT_SELECTION_UNAVAILABLE',
  });
});
it('rejects symbolic-link leaves and nonregular files', async () => {
  const { parent, path } = await fixture();
  const link = join(parent, 'link.png');
  await symlink(path, link);
  for (const target of [link, parent]) await expect(snapshotSelectedFile(target)).rejects.toThrow();
});
it('rejects empty and oversized files before reading bytes', async () => {
  const { path } = await fixture();
  const spy = vi.spyOn(SafeRoot.prototype, 'openRead');
  await truncate(path, 0);
  await expect(snapshotSelectedFile(path)).rejects.toMatchObject({ code: 'ATTACHMENT_INVALID_SIZE' });
  await truncate(path, 25 * 1024 ** 2 + 1);
  await expect(snapshotSelectedFile(path)).rejects.toMatchObject({ code: 'ATTACHMENT_FILE_TOO_LARGE' });
  expect(spy).not.toHaveBeenCalled();
});
it('rejects a replaced file and a substituted symlink', async () => {
  const { path } = await fixture();
  const selection = await snapshotSelectedFile(path);
  await rename(path, `${path}.old`);
  await writeFile(path, 'different');
  await expect(readSelectedFile(selection)).rejects.toMatchObject({ code: 'ATTACHMENT_SELECTION_CHANGED' });
  await rm(path);
  await symlink(`${path}.old`, path);
  await expect(readSelectedFile(selection)).rejects.toThrow();
});
it('rejects replacement of the selected parent even if the original file returns', async () => {
  const { parent, path } = await fixture();
  const selection = await snapshotSelectedFile(path);
  await rename(parent, `${parent}.old`);
  await mkdir(parent);
  await rename(join(`${parent}.old`, 'plan.png'), path);
  await expect(readSelectedFile(selection)).rejects.toMatchObject({ code: 'ATTACHMENT_SELECTION_CHANGED' });
});
it('rejects same-inode edits even with the old mtime restored', async () => {
  const { path } = await fixture();
  const selection = await snapshotSelectedFile(path);
  const before = await lstat(path);
  await writeFile(path, 'modified');
  await utimes(path, before.atime, before.mtime);
  expect((await lstat(path)).ino).toBe(before.ino);
  await expect(readSelectedFile(selection)).rejects.toMatchObject({ code: 'ATTACHMENT_SELECTION_CHANGED' });
});
it('checks content identity after the bounded read', async () => {
  const { path } = await fixture();
  const selection = await snapshotSelectedFile(path);
  const original = SafeRoot.prototype.openRead;
  vi.spyOn(SafeRoot.prototype, 'openRead').mockImplementation(async function (this: SafeRoot, name) {
    const handle = await original.call(this, name);
    return {
      ...handle,
      readFile: async (limit) => {
        expect(limit).toBe(25 * 1024 ** 2);
        const bytes = await handle.readFile(limit);
        await writeFile(path, 'modified');
        return bytes;
      },
    };
  });
  await expect(readSelectedFile(selection)).rejects.toMatchObject({ code: 'ATTACHMENT_SELECTION_CHANGED' });
});
it('rejects paths with traversal and sanitizes filesystem failures', async () => {
  const { parent, path } = await fixture();
  for (const target of [join(parent, 'missing.png'), `${parent}/../selected/plan.png`, 'plan.png']) {
    try {
      await snapshotSelectedFile(target);
      throw new Error('unexpected acceptance');
    } catch (error) {
      expect(String(error)).not.toContain(parent);
      expect(String(error)).not.toContain('unexpected acceptance');
    }
  }
  const selection = await snapshotSelectedFile(path);
  await rm(path);
  await expect(readSelectedFile(selection)).rejects.toThrow('Select the file again');
});

it('bounds actual bytes when the file grows after the initial descriptor stat', async () => {
  const { path } = await fixture();
  await truncate(path, 1024 * 1024);
  const selection = await snapshotSelectedFile(path);
  const probe = await open(path, 'r');
  const prototype = Object.getPrototypeOf(probe) as {
    read: (...args: unknown[]) => Promise<{ bytesRead: number }>;
  };
  const read = prototype.read;
  await probe.close();
  let total = 0;
  vi.spyOn(prototype, 'read').mockImplementation(async function (this: unknown, ...args: unknown[]) {
    const result = await read.apply(this, args);
    if (total === 0) await truncate(path, 26 * 1024 ** 2);
    total += result.bytesRead;
    return result;
  });
  await expect(readSelectedFile(selection)).rejects.toThrow('Select the file again');
  expect(total).toBe(25 * 1024 ** 2 + 1);
});
