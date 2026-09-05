import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const flush = (stream, text) =>
  new Promise((resolve, reject) => stream.write(text, (error) => (error ? reject(error) : resolve())));

export async function finishTerminalVerification({
  reportPath,
  report,
  exitCode,
  cleanup = async () => {},
  platform = process.platform,
}) {
  let code = exitCode;
  try {
    await mkdir(dirname(resolve(reportPath)), { recursive: true });
    const text = JSON.stringify(report, null, 2) + '\n';
    await writeFile(reportPath, text);
    await flush(code === 0 ? process.stdout : process.stderr, text);
  } catch (error) {
    code = 1;
    await flush(process.stderr, `Unable to persist terminal verification: ${error.message}\n`);
  }
  let timer;
  try {
    await Promise.race([
      cleanup(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Terminal cleanup timed out.')), 6000);
      }),
    ]);
  } catch (error) {
    code = 1;
    await flush(process.stderr, `Terminal cleanup failed: ${error.message}\n`);
  } finally {
    clearTimeout(timer);
  }
  // node-pty 1.1.0 WindowsPtyAgent._cleanUpProcess closes the output socket,
  // but leaves WindowsConoutConnection's Worker alive on natural PTY exit.
  // Success reaches here only after real product exit and all assertions.
  // Failure diagnostics are persisted before the bounded cleanup above.
  // Exit only this disposable Windows verifier, never signal an exited PTY PID.
  if (platform === 'win32') process.exit(code);
  process.exitCode = code;
}
