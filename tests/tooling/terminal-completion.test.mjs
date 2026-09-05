import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

for (const failed of [false, true]) {
  test(`terminal verifier exits ${failed ? 'failure' : 'success'} after durable output despite retained driver handles`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'terminal-completion-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const report = join(root, 'report.json');
    const helper = pathToFileURL(resolve('scripts/terminal-completion.mjs')).href;
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { finishTerminalVerification } from ${JSON.stringify(helper)};
      const { Worker } = await import('node:worker_threads');
      new Worker('setInterval(() => {}, 1000)', { eval: true });
      await finishTerminalVerification({ reportPath: ${JSON.stringify(report)},
        report: { passed: ${!failed}, diagnostic: 'retained driver fixture' },
        exitCode: ${failed ? 1 : 0}, platform: 'win32',
        cleanup: async () => {
          const { readFile } = await import('node:fs/promises');
          const saved = JSON.parse(await readFile(${JSON.stringify(report)}, 'utf8'));
          if (saved.passed !== ${!failed}) throw new Error('report not persisted before cleanup');
        } });
    `,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '',
      errors = '';
    child.stdout.on('data', (b) => (output += b));
    child.stderr.on('data', (b) => (errors += b));
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    const result = await new Promise((resolve) =>
      child.on('close', (code, signal) => resolve({ code, signal })),
    );
    clearTimeout(timer);
    assert.deepEqual(result, { code: failed ? 1 : 0, signal: null }, errors);
    const written = JSON.parse(await readFile(report, 'utf8'));
    assert.equal(written.passed, !failed);
    assert.deepEqual(JSON.parse(failed ? errors : output), written);
  });
}
test('Windows failure emits diagnostics before bounded stalled cleanup', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'terminal-cleanup-bound-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = join(root, 'report.json');
  const helper = pathToFileURL(resolve('scripts/terminal-completion.mjs')).href;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { finishTerminalVerification } from ${JSON.stringify(helper)};
    const { Worker } = await import('node:worker_threads');
    new Worker('setInterval(() => {}, 1000)', { eval: true });
    await finishTerminalVerification({ reportPath: ${JSON.stringify(report)},
      report: { passed: false, error: 'original PTY diagnostic' }, exitCode: 1,
      platform: 'win32', cleanup: () => new Promise(() => {}) });
  `,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let errors = '';
  child.stderr.on('data', (b) => (errors += b));
  const timer = setTimeout(() => child.kill('SIGKILL'), 9000);
  const result = await new Promise((resolve) =>
    child.on('close', (code, signal) => resolve({ code, signal })),
  );
  clearTimeout(timer);
  assert.deepEqual(result, { code: 1, signal: null });
  assert.ok(errors.indexOf('original PTY diagnostic') < errors.indexOf('Terminal cleanup timed out'));
  assert.match(errors, /Terminal cleanup timed out/);
  assert.equal(JSON.parse(await readFile(report, 'utf8')).error, 'original PTY diagnostic');
});
