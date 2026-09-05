import { fork, type ChildProcess } from 'node:child_process';
import { join, isAbsolute } from 'node:path';
import semver from 'semver';
import type { Readable } from 'node:stream';
import type { RuntimeDescriptor } from './contracts.js';
import { RuntimeError } from './errors.js';
export const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000;
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
    throw new RuntimeError('RUNTIME_HANDSHAKE', 'Original launcher identity is invalid.', {
      phase: 'launcher-identity',
    });
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
      const started = performance.now();
      const timeoutMs = options.timeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
      const fail = (
        phase: 'timeout' | 'identity' | 'spawn-error' | 'child-exit',
        code?: number | null,
        signal?: string | null,
      ) => {
        cleanup();
        const reasons = {
          timeout: 'Runtime identity verification timed out.',
          identity: 'Selected runtime sent an invalid identity.',
          'spawn-error': 'Selected runtime process could not start.',
          'child-exit': 'Selected runtime exited before identity verification.',
        };
        reject(
          new RuntimeError('RUNTIME_HANDSHAKE', `${reasons[phase]} The project was not supplied.`, {
            phase,
            timeoutMs,
            elapsedMs: Math.round(performance.now() - started),
            ...(typeof code === 'number' && Number.isSafeInteger(code) ? { exitCode: code } : {}),
            ...(['SIGTERM', 'SIGKILL', 'SIGSEGV', 'SIGABRT', 'SIGBUS', 'SIGILL', 'SIGTRAP'].includes(
              signal ?? '',
            )
              ? { signal }
              : {}),
          }),
        );
      };
      const timer = setTimeout(() => fail('timeout'), timeoutMs);
      const spawnFailed = () => fail('spawn-error');
      const exited = (code: number | null, signal: string | null) => fail('child-exit', code, signal);
      const ready = (message: unknown) => {
        if (!message || typeof message !== 'object') {
          fail('identity');
          return;
        }
        const m = message as Record<string, unknown>;
        if (
          m.type !== 'robopomelo:ready' ||
          m.version !== runtime.manifest.version ||
          m.launcherProtocol !== runtime.manifest.launcherProtocol ||
          m.manifestDigest !== runtime.manifestDigest
        ) {
          fail('identity');
          return;
        }
        cleanup();
        resolve();
      };
      function cleanup() {
        clearTimeout(timer);
        child.removeListener('message', ready);
        child.removeListener('error', spawnFailed);
        child.removeListener('exit', exited);
      }
      child.once('message', ready);
      child.once('error', spawnFailed);
      child.once('exit', exited);
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
            reject(
              new RuntimeError('RUNTIME_START_FAILED', 'Runtime closed before accepting the command.', {
                phase: 'command-transfer',
              }),
            );
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
      : new RuntimeError('RUNTIME_START_FAILED', 'Runtime closed before accepting the command.', {
          phase: 'command-transfer',
        });
  }
  const input = options.input ?? process.stdin;
  if (child.stdin) {
    child.stdin.on('error', () => {});
    input.pipe(child.stdin);
    void completed.then(() => input.unpipe(child.stdin!));
  }
  return { version: runtime.manifest.version, manifestDigest: runtime.manifestDigest, child, completed };
}
