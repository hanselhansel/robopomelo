import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
/** Register immediately after spawn. Only owns this test's launcher and descendants. */
export function cleanupFor(child, ownsProcessGroup = false) {
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
      const live = child.exitCode === null && child.signalCode === null;
      if (process.platform === 'win32' && live) {
        try {
          await exec('taskkill', ['/pid', String(child.pid), '/t', '/f'], { timeout: 5000 });
        } catch (error) {
          // A concurrent exit is successful only if stream closure is proven below.
          terminationError = error;
        }
      } else if (process.platform !== 'win32' && (live || ownsProcessGroup)) {
        const signal = (value, group) => {
          try {
            if (group) {
              if (!Number.isInteger(child.pid) || child.pid <= 0 || child.pid === process.pid)
                throw new Error('Test process group identity is unavailable.');
              process.kill(-child.pid, value);
            } else child.kill(value);
          } catch (error) {
            if (error.code !== 'ESRCH') terminationError = error;
          }
        };
        // Normal shutdown still lets the launcher forward SIGTERM gracefully.
        // Escalation owns the isolated group even if its launcher has already exited.
        signal('SIGTERM', ownsProcessGroup && !live);
        timer = setTimeout(() => {
          if (!closed) signal('SIGKILL', ownsProcessGroup);
        }, 5000);
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
