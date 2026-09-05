import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, lstat, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'terminal-preparation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.1.0' }));
  return root;
}
async function prepare(root, platform, arch = 'arm64') {
  const { prepareTerminal } = await import('../../scripts/prepare-terminal.mjs');
  assert.equal(typeof prepareTerminal, 'function', 'preparation must be callable for an isolated package');
  return prepareTerminal({ root, platform, arch });
}
test('Linux and Windows require no macOS-only spawn helper', async (t) => {
  const root = await fixture(t);
  await prepare(root, 'linux', 'x64');
  await prepare(root, 'win32', 'x64');
  await assert.rejects(lstat(join(root, 'build')), { code: 'ENOENT' });
});
test('macOS fails closed when the rebuilt or prebuilt helper is missing', async (t) => {
  await assert.rejects(prepare(await fixture(t), 'darwin'), /helper is missing/);
});
for (const relative of ['build/Release/spawn-helper', 'prebuilds/darwin-arm64/spawn-helper']) {
  test(`macOS makes the regular ${relative} executable`, async (t) => {
    const root = await fixture(t),
      path = join(root, relative);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, 'test helper', { mode: 0o644 });
    await prepare(root, 'darwin');
    assert.equal((await lstat(path)).mode & 0o777, 0o755);
  });
}
test('macOS rejects symlink helpers without chmodding their target', async (t) => {
  const root = await fixture(t),
    target = join(root, 'outside-helper');
  await writeFile(target, 'untouched', { mode: 0o600 });
  await mkdir(join(root, 'build/Release'), { recursive: true });
  await symlink(target, join(root, 'build/Release/spawn-helper'));
  await assert.rejects(prepare(root, 'darwin'), /regular packaged file/);
  assert.equal((await lstat(target)).mode & 0o777, 0o600);
});
test('driver version changes require setup review on every platform', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.2.0' }));
  await assert.rejects(prepare(root, 'linux'), /pinned version/);
});
