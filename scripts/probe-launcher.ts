import { fork } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBundledRuntime } from '../apps/cli/src/runtime/bundle.js';
import { launchRuntime, DEFAULT_HANDSHAKE_TIMEOUT_MS } from '../apps/cli/src/runtime/launcher.js';
export async function probeLauncher(directory: string, count: number) {
  const runtime = await loadBundledRuntime(directory);
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'rp-launch-profile-')));
  const samples: { handshakeMs: number; totalMs: number; exitCode: number | null }[] = [];
  try {
    for (let index = 0; index < count; index++) {
      let handshakeMs = 0;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const started = performance.now();
      try {
        const launched = await launchRuntime(runtime, ['--version', '--offline', '--json'], {
          cwd: temporary,
          timeoutMs: 30000,
          env: {
            ...process.env,
            ROBOPOMELO_CONFIG_DIR: join(temporary, 'config'),
            ROBOPOMELO_CACHE_DIR: join(temporary, 'cache'),
          },
          spawn: (entry, options) => {
            const beforeFork = performance.now();
            const child = fork(entry, [], {
              ...options,
              execArgv: [],
              stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            });
            child.stdout!.resume();
            child.stderr!.resume();
            child.once('message', () => {
              handshakeMs = Math.round(performance.now() - beforeFork);
            });
            deadline = setTimeout(() => child.kill('SIGKILL'), 45000);
            return child;
          },
        });
        const completed = await launched.completed;
        samples.push({
          handshakeMs,
          totalMs: Math.round(performance.now() - started),
          exitCode: completed.code,
        });
        if (completed.code !== 0) throw new Error('Verified runtime did not finish its version command.');
      } finally {
        clearTimeout(deadline);
      }
    }
    return {
      status: samples.every((s) => s.handshakeMs <= DEFAULT_HANDSHAKE_TIMEOUT_MS)
        ? 'within-budget'
        : 'exceeds-default-budget',
      version: runtime.manifest.version,
      manifestDigest: runtime.manifestDigest,
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      defaultHandshakeMs: DEFAULT_HANDSHAKE_TIMEOUT_MS,
      diagnosticHandshakeMs: 30000,
      samples,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
