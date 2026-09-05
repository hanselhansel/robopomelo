import { test } from 'node:test';
import assert from 'node:assert/strict';
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
