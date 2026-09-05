import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { launchJson } from '../../scripts/distribution-process.mjs';

test('closing a verifier waits for inherited streams after launcher exit', async () => {
  const source = `
    const { spawn } = require('node:child_process');
    spawn(process.execPath, ['-e', 'setTimeout(() => {}, 800)'], { stdio: ['ignore', 1, 2] });
    console.log(JSON.stringify({ ok: true }));
    process.on('SIGTERM', () => process.exit(0));
  `;
  const app = launchJson(process.execPath, ['-e', source]);
  await app.ready;
  let closed = false;
  app.child.once('close', () => {
    closed = true;
  });
  await app.close();
  assert.equal(closed, true, 'temporary files cannot be removed while descendant streams remain open');
});

for (const closure of ['before-error', 'after-error', 'never']) {
  test(`Windows taskkill exit race requires stream closure: ${closure}`, () => {
    // Isolate platform and builtin mocks from the real-process tests above.
    const result = spawnSync(process.execPath, ['--input-type=module'], {
      encoding: 'utf8',
      input: `
        import assert from 'node:assert/strict';
        import cp from 'node:child_process';
        import { syncBuiltinESMExports } from 'node:module';
        import { EventEmitter } from 'node:events';
        const child = Object.assign(new EventEmitter(), { pid: 12345, exitCode: null, signalCode: null });
        const closure = ${JSON.stringify(closure)};
        const finish = () => { child.exitCode = 0; child.emit('close', 0, null); };
        cp.execFile = (_file, _args, _opts, callback) => {
          queueMicrotask(() => {
            if (closure === 'before-error') finish();
            callback(new Error('process not found'), '', 'process not found');
            if (closure === 'after-error') setTimeout(finish, 5);
          });
          return new EventEmitter();
        };
        syncBuiltinESMExports();
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const schedule = globalThis.setTimeout;
        globalThis.setTimeout = (fn, ms, ...args) => schedule(fn, ms === 10000 ? 50 : ms, ...args);
        const { cleanupFor } = await import(${JSON.stringify(new URL('../../scripts/test-process-cleanup.mjs', import.meta.url).href)});
        const close = cleanupFor(child);
        if (closure === 'never') {
          await assert.rejects(close(), (error) => {
            assert.match(error.message, /streams did not close/);
            assert.equal(error.cause.message, 'process not found');
            return true;
          });
        } else {
          await close();
          assert.equal(child.exitCode, 0);
        }
      `,
      timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  });
}

test('cleanup after launcher exit still waits for descendants and is repeatable', async () => {
  const app = launchJson(process.execPath, [
    '-e',
    `
    const { spawn } = require('node:child_process');
    spawn(process.execPath, ['-e', 'setTimeout(() => {}, 800)'], { stdio: ['ignore', 1, 2] });
    console.log(JSON.stringify({ ok: true }));
    setTimeout(() => process.exit(0), 50);
  `,
  ]);
  const exited = new Promise((resolve) => app.child.once('exit', resolve));
  let closed = false;
  app.child.once('close', () => {
    closed = true;
  });
  await app.ready;
  await exited;
  assert.equal(closed, false, 'fixture must retain inherited streams after parent exit');
  await app.close();
  assert.equal(closed, true);
  await app.close();
});
