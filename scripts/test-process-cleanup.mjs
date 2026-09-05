import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
/** Register immediately after spawn. Only owns this test's launcher and descendants. */
export function cleanupFor(child) {
  let closed = false;
  const completion = new Promise((resolve) =>
    child.once('close', () => {
      closed = true;
      resolve();
    }),
  );
  return async () => {
    if (closed) return;
    let timer;
    let terminationError;
    try {
      if (child.exitCode === null && child.signalCode === null) {
        if (process.platform === 'win32') {
          // Windows SIGTERM kills the parent without running its signal handler.
          // Keep the live parent identity available while terminating its tree.
          try {
            await exec('taskkill', ['/pid', String(child.pid), '/t', '/f'], { timeout: 5000 });
          } catch (error) {
            // The parent can exit while taskkill starts. Only stream closure
            // below proves cleanup succeeded; otherwise retain this failure.
            terminationError = error;
          }
        } else {
          child.kill('SIGTERM');
          timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        }
      }
      await Promise.race([
        completion,
        new Promise((_, reject) => {
          const deadline = setTimeout(
            () => reject(new Error('Test process streams did not close.', { cause: terminationError })),
            10000,
          );
          completion.then(() => clearTimeout(deadline));
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
