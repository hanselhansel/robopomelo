import { spawn, spawnSync } from 'node:child_process';
import { cleanupFor } from './test-process-cleanup.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export function npm(args, options = {}) {
  const cli =
    process.env.npm_execpath ??
    join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const windowsCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return run(
    process.execPath,
    [process.platform === 'win32' && !process.env.npm_execpath ? windowsCli : cli, ...args],
    options,
  );
}
export function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Command failed (${result.status}): ${binary} ${args.join(' ')}\n${result.stderr}\n${result.stdout}`,
      { cause: result.error },
    );
  return result.stdout;
}
export function launchJson(binary, args, options = {}) {
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  const close = cleanupFor(child);
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const ready = new Promise((resolve, reject) => {
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Browser launcher timed out.'));
    }, 15000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const end = stdout.indexOf('\n');
      if (end >= 0) {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(stdout.slice(0, end)));
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
      reject(new Error(`Browser launcher exited ${code}: ${stderr}`));
    });
  });
  return {
    child,
    ready,
    close,
  };
}
export const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
