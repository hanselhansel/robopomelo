import { spawn } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
export async function localApp() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'robopomelo-browser-')));
  const child = spawn(
    process.execPath,
    [resolve('dist/package/bin/robopomelo.mjs'), 'open', '--no-browser', '--offline', '--json'],
    {
      cwd: directory,
      env: {
        ...process.env,
        ROBOPOMELO_CONFIG_DIR: join(directory, 'config'),
        ROBOPOMELO_CACHE_DIR: join(directory, 'cache'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const exit = new Promise((resolve) => child.once('exit', resolve));
  const url = await new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Packaged app startup timed out.'));
    }, 15000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('\n')) {
        clearTimeout(timer);
        try {
          const result = JSON.parse(output.split('\n')[0]!);
          if (!result.ok) throw new Error(output);
          resolve(result.data.bootstrapUrl);
        } catch (error) {
          reject(error);
        }
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`App exited ${code}: ${stderr}`));
    });
  });
  return {
    url,
    directory,
    project: join(directory, 'project'),
    close: async () => {
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exit;
      clearTimeout(timer);
      await rm(directory, { recursive: true, force: true });
    },
  };
}
