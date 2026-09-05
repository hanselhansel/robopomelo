import { afterEach, expect, it, vi } from 'vitest';
import { writeFile, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionFixture, snapshot, commitInput } from './helpers/session-fixture.js';
import { byteHash, mutationDigest } from '../../packages/project-fs/src/transactions/digest.js';
import { replaceSource } from '../../packages/project-fs/src/transactions/replace-source.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
const denied = () => Object.assign(new Error('sharing conflict'), { code: 'EPERM', syscall: 'rename' });
async function fixture() {
  const f = await sessionFixture();
  cleanup.push(f.close);
  const prior = await readFile(join(f.path, 'deployment.yaml'));
  const next = Buffer.from('new candidate');
  await writeFile(join(f.path, 'replacement.yaml'), next);
  const hashes = { prior: byteHash(prior), next: byteHash(next) };
  return { ...f, prior, next, hashes };
}
const windows = { platform: 'win32', delay: async () => {} };
it('retries transient Windows rename denial and performs one atomic replacement', async () => {
  const f = await fixture();
  const actual = f.root.renameReplace.bind(f.root);
  const call = vi
    .spyOn(f.root, 'renameReplace')
    .mockRejectedValueOnce(denied())
    .mockRejectedValueOnce(denied())
    .mockImplementation(actual);
  await replaceSource(f.root, 'replacement.yaml', f.hashes, windows);
  expect(call).toHaveBeenCalledTimes(3);
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(f.next);
});
it('bounds persistent denial and preserves both original and prepared bytes', async () => {
  const f = await fixture();
  const error = denied();
  const call = vi.spyOn(f.root, 'renameReplace').mockRejectedValue(error);
  await expect(replaceSource(f.root, 'replacement.yaml', f.hashes, windows)).rejects.toBe(error);
  expect(call).toHaveBeenCalledTimes(8);
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(f.prior);
  expect(await readFile(join(f.path, 'replacement.yaml'))).toEqual(f.next);
});
it.each([
  { platform: 'linux', code: 'EPERM', syscall: 'rename' },
  { platform: 'win32', code: 'EIO', syscall: 'rename' },
  { platform: 'win32', code: 'EPERM', syscall: 'realpath' },
])('does not retry other failure boundaries: %j', async ({ platform, code, syscall }) => {
  const f = await fixture();
  const error = Object.assign(new Error('failure'), { code, syscall });
  const call = vi.spyOn(f.root, 'renameReplace').mockRejectedValue(error);
  await expect(replaceSource(f.root, 'replacement.yaml', f.hashes, { ...windows, platform })).rejects.toBe(
    error,
  );
  expect(call).toHaveBeenCalledTimes(1);
});
it('preserves an external in-place source edit during retry', async () => {
  const f = await fixture();
  const call = vi.spyOn(f.root, 'renameReplace').mockImplementationOnce(async () => {
    await writeFile(join(f.path, 'deployment.yaml'), 'external change');
    throw denied();
  });
  await expect(replaceSource(f.root, 'replacement.yaml', f.hashes, windows)).rejects.toMatchObject({
    code: 'STALE_BASE',
  });
  expect(call).toHaveBeenCalledTimes(1);
  expect(await readFile(join(f.path, 'deployment.yaml'), 'utf8')).toBe('external change');
});
it('rejects prepared-byte tampering during retry', async () => {
  const f = await fixture();
  const call = vi.spyOn(f.root, 'renameReplace').mockImplementationOnce(async () => {
    await writeFile(join(f.path, 'replacement.yaml'), 'tampered');
    throw denied();
  });
  await expect(replaceSource(f.root, 'replacement.yaml', f.hashes, windows)).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  expect(call).toHaveBeenCalledTimes(1);
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(f.prior);
});
it('rejects a new source inode even if its bytes match during retry', async () => {
  const f = await fixture();
  const call = vi.spyOn(f.root, 'renameReplace').mockImplementationOnce(async () => {
    await writeFile(join(f.path, 'other.yaml'), f.prior);
    await rename(join(f.path, 'other.yaml'), join(f.path, 'deployment.yaml'));
    throw denied();
  });
  await expect(replaceSource(f.root, 'replacement.yaml', f.hashes, windows)).rejects.toMatchObject({
    code: 'STALE_BASE',
  });
  expect(call).toHaveBeenCalledTimes(1);
});
it('does not retry a failure after replacement already occurred', async () => {
  const f = await fixture();
  const actual = f.root.renameReplace.bind(f.root);
  const error = Object.assign(new Error('postcheck failed'), { code: 'PATH_CHANGED' });
  const call = vi.spyOn(f.root, 'renameReplace').mockImplementationOnce(async (...args) => {
    await actual(...args);
    throw error;
  });
  await expect(replaceSource(f.root, 'replacement.yaml', f.hashes, windows)).rejects.toBe(error);
  expect(call).toHaveBeenCalledTimes(1);
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(f.next);
});
it('rechecks identity after reading retry hashes', async () => {
  const f = await fixture();
  const read = f.root.readFile.bind(f.root);
  let blocked = false;
  const call = vi.spyOn(f.root, 'renameReplace').mockImplementationOnce(async () => {
    blocked = true;
    throw denied();
  });
  vi.spyOn(f.root, 'readFile').mockImplementation(async (...args) => {
    const bytes = await read(...args);
    if (blocked && args[0] === 'deployment.yaml') {
      blocked = false;
      await writeFile(join(f.path, 'other.yaml'), f.prior);
      await rename(join(f.path, 'other.yaml'), join(f.path, 'deployment.yaml'));
    }
    return bytes;
  });
  await expect(replaceSource(f.root, 'replacement.yaml', f.hashes, windows)).rejects.toMatchObject({
    code: 'STALE_BASE',
  });
  expect(call).toHaveBeenCalledTimes(1);
});

it('rejects a replaced staging inode even when its bytes match', async () => {
  const f = await fixture();
  const call = vi.spyOn(f.root, 'renameReplace').mockImplementationOnce(async () => {
    await writeFile(join(f.path, 'other.yaml'), f.next);
    await rename(join(f.path, 'other.yaml'), join(f.path, 'replacement.yaml'));
    throw denied();
  });
  await expect(replaceSource(f.root, 'replacement.yaml', f.hashes, windows)).rejects.toMatchObject({
    code: 'RECOVERY_REQUIRED',
  });
  expect(call).toHaveBeenCalledTimes(1);
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(f.prior);
});
it('never recreates a source removed between attempts', async () => {
  const f = await fixture();
  const call = vi.spyOn(f.root, 'renameReplace').mockImplementationOnce(async () => {
    await unlink(join(f.path, 'deployment.yaml'));
    throw denied();
  });
  await expect(replaceSource(f.root, 'replacement.yaml', f.hashes, windows)).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect(call).toHaveBeenCalledTimes(1);
  await expect(readFile(join(f.path, 'deployment.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it.runIf(process.platform === 'win32')(
  'leaves persistent native denial recoverable without claiming a commit',
  async () => {
    const f = await fixture();
    const before = await snapshot(f.session);
    const input = commitInput(before, 'denied-source-replacement', f.authorization);
    const call = vi.spyOn(f.root, 'renameReplace').mockRejectedValue(denied());
    await expect(f.session.commit(input)).rejects.toMatchObject({ code: 'EPERM', syscall: 'rename' });
    expect(call).toHaveBeenCalledTimes(8);
    call.mockRestore();
    expect(await f.session.mutationStatus(input.idempotencyKey, mutationDigest(input))).toMatchObject({
      status: 'pending',
    });
    expect(await f.session.recover()).toContainEqual({
      mutationId: input.idempotencyKey,
      kind: 'uncommitted',
    });
    expect((await snapshot(f.session)).sourceHash).toBe(before.sourceHash);
  },
);
