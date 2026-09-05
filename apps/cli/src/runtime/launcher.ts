import { fork, type ChildProcess } from 'node:child_process';
import { join, isAbsolute } from 'node:path';
import semver from 'semver';
import type { Readable } from 'node:stream';
import type { RuntimeDescriptor } from './contracts.js';
import { RuntimeError } from './errors.js';
export type RuntimeSpawn = (
  entryPoint: string,
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => ChildProcess;
export interface RuntimeLaunchOptions {
  cwd?: string;
  spawn?: RuntimeSpawn;
  timeoutMs?: number;
  input?: Readable;
  env?: NodeJS.ProcessEnv;
  launcherDirectory?: string;
  launcherVersion?: string;
  bundledRuntimeVersion?: string;
}
export interface LaunchedRuntime {
  version: string;
  manifestDigest: string;
  child: ChildProcess;
  completed: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}
const defaultSpawn: RuntimeSpawn = (entry, options) =>
  fork(entry, [], {
    ...options,
    execPath: process.execPath,
    execArgv: [],
    stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
  });
/** The verified child receives no project argv, working directory or stdin until its identity handshake. */
export async function launchRuntime(
  runtime: RuntimeDescriptor,
  argv: string[],
  options: RuntimeLaunchOptions = {},
): Promise<LaunchedRuntime> {
  const launcherDirectory = options.launcherDirectory ?? runtime.directory,
    launcherVersion = options.launcherVersion ?? runtime.manifest.version,
    bundledRuntimeVersion = options.bundledRuntimeVersion ?? runtime.manifest.version;
  if (
    !isAbsolute(launcherDirectory) ||
    launcherDirectory.length > 4096 ||
    launcherDirectory.includes('\0') ||
    !semver.valid(launcherVersion) ||
    launcherVersion.length > 40 ||
    !semver.valid(bundledRuntimeVersion) ||
    bundledRuntimeVersion.length > 40
  )
    throw new RuntimeError('RUNTIME_HANDSHAKE', 'Original launcher identity is invalid.');
  const env = { ...(options.env ?? process.env) };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  delete env.PWD;
  delete env.INIT_CWD;
  const child = (options.spawn ?? defaultSpawn)(join(runtime.directory, runtime.manifest.entryPoint), {
    cwd: runtime.directory,
    env,
  });
  let closed = false;
  const completed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('close', (code, signal) => {
      closed = true;
      resolve({ code, signal });
    });
    // Spawn/IPC errors are handled below; close remains the resource-release boundary.
    child.on('error', () => {});
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = () => {
        cleanup();
        reject(
          new RuntimeError(
            'RUNTIME_HANDSHAKE',
            'Selected runtime did not confirm its exact version and complete asset manifest. The project was not supplied.',
          ),
        );
      };
      const timer = setTimeout(fail, options.timeoutMs ?? 5000);
      const ready = (message: unknown) => {
        if (!message || typeof message !== 'object') {
          fail();
          return;
        }
        const m = message as Record<string, unknown>;
        if (
          m.type !== 'robopomelo:ready' ||
          m.version !== runtime.manifest.version ||
          m.launcherProtocol !== runtime.manifest.launcherProtocol ||
          m.manifestDigest !== runtime.manifestDigest
        ) {
          fail();
          return;
        }
        cleanup();
        resolve();
      };
      function cleanup() {
        clearTimeout(timer);
        child.removeListener('message', ready);
        child.removeListener('error', fail);
        child.removeListener('exit', fail);
      }
      child.once('message', ready);
      child.once('error', fail);
      child.once('exit', fail);
    });
    await new Promise<void>((resolve, reject) => {
      child.send(
        {
          type: 'robopomelo:start',
          argv: [...argv],
          cwd: options.cwd ?? process.cwd(),
          stdinIsTTY: process.stdin.isTTY === true,
          launcherDirectory,
          launcherVersion,
          bundledRuntimeVersion,
        },
        (error) => {
          if (error) {
            reject(new RuntimeError('RUNTIME_START_FAILED', 'Runtime closed before accepting the command.'));
          } else resolve();
        },
      );
    });
  } catch (error) {
    if (!closed) {
      child.kill();
      const escalation = setTimeout(() => child.kill('SIGKILL'), 1000);
      try {
        await completed;
      } finally {
        clearTimeout(escalation);
      }
    }
    throw error instanceof RuntimeError
      ? error
      : new RuntimeError('RUNTIME_START_FAILED', 'Runtime closed before accepting the command.');
  }
  const input = options.input ?? process.stdin;
  if (child.stdin) {
    child.stdin.on('error', () => {});
    input.pipe(child.stdin);
    void completed.then(() => input.unpipe(child.stdin!));
  }
  return { version: runtime.manifest.version, manifestDigest: runtime.manifestDigest, child, completed };
}
