import { spawn } from 'node:child_process';
import { cleanupFor } from '../../scripts/test-process-cleanup.mjs';
/** Own a separate process group. A child timer cannot bound native modal hangs. */
export async function runSmokeProcess(binary, args, { timeoutMs = 20000, onOutput = () => {} } = {}) {
  const ownsGroup = process.platform !== 'win32';
  // IDE-hosted shells export ELECTRON_RUN_AS_NODE, which would turn the app binary into plain Node.
  const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env;
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: ownsGroup, env });
  const cleanup = cleanupFor(child, ownsGroup);
  let output = '',
    timer;
  const complete = new Promise((resolve, reject) => {
    function capture(chunk) {
      const text = chunk.toString();
      output = (output + text).slice(-65536);
      onOutput(text);
    }
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code !== 0 || signal)
        reject(new Error('Electron smoke exited ' + code + ' ' + (signal ?? '') + '\n' + output));
      else if (!/^ELECTRON_SMOKE_OK [0-9]+\.[0-9]+\.[0-9]+$/m.test(output))
        reject(new Error('Electron smoke exited without assertion evidence.\n' + output));
      else resolve(output);
    });
    timer = setTimeout(
      () => reject(new Error('Electron smoke timed out after ' + timeoutMs + 'ms.\n' + output)),
      timeoutMs,
    );
  });
  try {
    return await complete;
  } finally {
    clearTimeout(timer);
    // Await close, including inherited pipes, even when the launcher already exited.
    await cleanup();
  }
}
