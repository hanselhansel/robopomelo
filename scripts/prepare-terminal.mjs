import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { lstat, chmod } from 'node:fs/promises';
const require = createRequire(import.meta.url),
  root = dirname(require.resolve('node-pty/package.json'));
if (require('node-pty/package.json').version !== '1.1.0')
  throw new Error('Review native driver setup when changing the pinned version.');
// npm normalizes prebuilt helper modes. Unix PTY creation requires its packaged helper to be executable.
if (process.platform !== 'win32') {
  let found = false;
  for (const relative of [
    'build/Release/spawn-helper',
    `prebuilds/${process.platform}-${process.arch}/spawn-helper`,
  ]) {
    const path = join(root, relative);
    let file;
    try {
      file = await lstat(path);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!file.isFile() || file.isSymbolicLink())
      throw new Error('Native terminal helper must be a regular packaged file.');
    await chmod(path, 0o755);
    found = true;
  }
  if (!found) throw new Error('Native terminal helper is missing. Run npm rebuild node-pty first.');
}
process.stdout.write('Test-only native terminal driver prepared.\n');
