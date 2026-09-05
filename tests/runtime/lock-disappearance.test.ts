import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, realpath, rm, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
import { acquireLock } from '../../packages/project-fs/src/fs/lock.js';

const boundary = vi.hoisted(() => ({ beforeRealpath: undefined as ((path: string) => Promise<void>) | undefined }));
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return {
    ...fs,
    realpath: async (...args: Parameters<typeof fs.realpath>) => {
      await boundary.beforeRealpath?.(String(args[0]));
      return fs.realpath(...args);
    },
  };
});
it('refuses a replaced root instead of retrying its missing lock entry', async () => {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'rp-lock-root-change-')));
  const moved = `${path}-original`;
  const root = await SafeRoot.open(path);
  await acquireLock(root, 'settings');
  let replaced = false;
  boundary.beforeRealpath = async (selected) => {
    if (selected !== join(path, '.robopomelo-settings.lock')) return;
    boundary.beforeRealpath = undefined;
    await rename(path, moved);
    await mkdir(path);
    replaced = true;
  };
  try {
    await expect(acquireLock(root, 'settings', { timeoutMs: 250 })).rejects.toMatchObject({
      code: 'ROOT_CHANGED',
    });
    expect(replaced).toBe(true);
  } finally {
    boundary.beforeRealpath = undefined;
    await root.close();
    await rm(path, { recursive: true, force: true });
    if (replaced) await rm(moved, { recursive: true, force: true });
  }
});
afterEach(() => { boundary.beforeRealpath = undefined; vi.restoreAllMocks(); });
it('retries when a cooperative owner releases its lock between lstat and realpath before mkdir', async () => {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'rp-lock-disappearance-')));
  const root = await SafeRoot.open(path);
  const owner = await acquireLock(root, 'settings');
  let released = false;
  boundary.beforeRealpath = async (selected) => {
    if (selected !== join(path, '.robopomelo-settings.lock')) return;
    boundary.beforeRealpath = undefined;
    await owner.release();
    released = true;
  };
  try {
    const next = await acquireLock(root, 'settings', { timeoutMs: 250 });
    expect(released).toBe(true);
    await next.assertHeld();
    await next.release();
  } finally {
    boundary.beforeRealpath = undefined;
    if (!released) await owner.release();
    await root.close();
    await rm(path, { recursive: true, force: true });
  }
});
