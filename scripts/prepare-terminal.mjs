import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lstat, chmod, readFile } from 'node:fs/promises';
export async function prepareTerminal({ root, platform = process.platform, arch = process.arch }) {
  if (JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version !== '1.1.0')
    throw new Error('Review native driver setup when changing the pinned version.');
  // node-pty 1.1.0 binding.gyp builds spawn-helper only for macOS.
  // src/unix/pty.cc uses it under __APPLE__; Linux calls forkpty directly.
  // npm normalizes the packaged macOS helper mode, so restore its executable bit.
  if (platform === 'darwin') {
    let found = false;
    for (const relative of ['build/Release/spawn-helper', `prebuilds/${platform}-${arch}/spawn-helper`]) {
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
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const require = createRequire(import.meta.url);
  await prepareTerminal({ root: dirname(require.resolve('node-pty/package.json')) });
  process.stdout.write('Test-only native terminal driver prepared.\n');
}
