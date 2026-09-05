import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, realpath, rm, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
import { acquireLock } from '../../packages/project-fs/src/fs/lock.js';

const boundary = vi.hoisted(() => ({
  beforeRealpath: undefined as ((path: string) => Promise<void>) | undefined,
  deletePendingPath: '',
}));
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>();
  return {
    ...fs,
    realpath: async (...args: Parameters<typeof fs.realpath>) => {
      await boundary.beforeRealpath?.(String(args[0]));
      try { return await fs.realpath(...args); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && String(args[0]) === boundary.deletePendingPath)
          throw Object.assign(new Error('Windows delete-pending realpath'), { code: 'EPERM', syscall: 'realpath' });
        throw error;
      }
    },
  };
});
it.each(['ENOENT', 'EPERM'] as const)('refuses a replaced root after %s instead of retrying its lock', async (code) => {
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
    if (code === 'EPERM') boundary.deletePendingPath = selected;
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
afterEach(() => { boundary.beforeRealpath = undefined; boundary.deletePendingPath = ''; vi.restoreAllMocks(); });
it.each(['ENOENT', 'EPERM'] as const)('retries a released lock after %s between lstat and realpath before mkdir', async (code) => {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'rp-lock-disappearance-')));
  const root = await SafeRoot.open(path);
  const owner = await acquireLock(root, 'settings');
  let released = false;
  boundary.beforeRealpath = async (selected) => {
    if (selected !== join(path, '.robopomelo-settings.lock')) return;
    boundary.beforeRealpath = undefined;
    await owner.release();
    if (code === 'EPERM') boundary.deletePendingPath = selected;
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

it('propagates persistent realpath EPERM when the lock still exists', async () => {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'rp-lock-permission-')));
  const root = await SafeRoot.open(path);
  const owner = await acquireLock(root, 'settings');
  const denied = Object.assign(new Error('Permission denied'), { code: 'EPERM', syscall: 'realpath' });
  boundary.beforeRealpath = async (selected) => {
    if (selected === join(path, '.robopomelo-settings.lock')) throw denied;
  };
  try {
    await expect(acquireLock(root, 'settings', { timeoutMs: 250 })).rejects.toBe(denied);
  } finally {
    boundary.beforeRealpath = undefined;
    await owner.assertHeld();
    await owner.release();
    await root.close();
    await rm(path, { recursive: true, force: true });
  }
});
it('propagates mkdir EPERM even when no lock exists', async () => {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'rp-lock-mkdir-permission-')));
  const root = await SafeRoot.open(path);
  const denied = Object.assign(new Error('Permission denied'), { code: 'EPERM', syscall: 'mkdir' });
  const create = vi.spyOn(root, 'mkdir').mockRejectedValue(denied);
  try {
    await expect(acquireLock(root, 'settings', { timeoutMs: 250 })).rejects.toBe(denied);
    expect(create).toHaveBeenCalledTimes(1);
  } finally {
    create.mockRestore();
    await root.close();
    await rm(path, { recursive: true, force: true });
  }
});
