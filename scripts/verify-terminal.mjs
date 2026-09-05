import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, realpath, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stripVTControlCharacters, parseArgs } from 'node:util';
import { run } from './distribution-process.mjs';
import { finishTerminalVerification } from './terminal-completion.mjs';
import { execFile } from 'node:child_process';
const { values } = parseArgs({
  options: { report: { type: 'string', default: 'test-results/terminal.json' } },
});
const pty = createRequire(import.meta.url)('node-pty');
const directory = await realpath(await mkdtemp(join(tmpdir(), 'robopomelo-pty-'))),
  project = join(directory, 'project');
const env = {
  ...process.env,
  ROBOPOMELO_CONFIG_DIR: join(directory, 'config'),
  ROBOPOMELO_CACHE_DIR: join(directory, 'cache'),
};
const entry = resolve('dist/package/bin/robopomelo.mjs');
run(
  process.execPath,
  [
    entry,
    'init',
    project,
    '--example',
    'inbound-pallet',
    '--authorize',
    'author',
    '--yes',
    '--offline',
    '--json',
  ],
  { cwd: directory, env },
);
const terminal = pty.spawn(
  process.execPath,
  [entry, 'plan', '--project', project, '--authorize', 'author', '--offline'],
  { name: 'xterm-256color', cols: 140, rows: 45, cwd: directory, env },
);
let output = '',
  cursor = 0,
  exitResult = null;
terminal.onData((text) => {
  output += stripVTControlCharacters(text);
});
const exited = new Promise((resolve) =>
  terminal.onExit((result) => {
    exitResult = result;
    resolve(result);
  }),
);
async function waitFor(text) {
  const start = Date.now();
  while (true) {
    const index = output.indexOf(text, cursor);
    if (index >= 0) {
      cursor = index + text.length;
      return;
    }
    if (exitResult || Date.now() - start > 20000)
      throw new Error(
        `Terminal did not reach ${JSON.stringify(text)}. Exit=${JSON.stringify(exitResult)}\n${output.slice(-3000)}`,
      );
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
async function enter(after, value) {
  await waitFor(after);
  terminal.write(value + '\r');
}
try {
  await enter('Choose an action', '1');
  await enter('7. Back', '1');
  await enter('Project name (:multi', 'Fictional native terminal revision');
  await enter('7. Back', '7');
  await enter('Choose an action', '10');
  await enter('Mutation recorder kind', '1');
  await enter('Supplied actor name', 'Fictional terminal engineer');
  await enter('On behalf of (optional)', '');
  await enter('Actor provenance/source (optional)', 'Controlled native terminal test');
  await enter('Purpose of this authored change', 'Verify a durable native-terminal edit');
  await waitFor('Saved revision');
  await enter('Choose an action', '12');
  await waitFor('Step 2/5:');
  await enter('Choose an action', '7');
  await waitFor('Step 3/5:');
  await enter('Choose an action', '7');
  await waitFor('Step 4/5:');
  await enter('Choose an action', '10');
  await waitFor('Step 5/5:');
  await enter('Choose an action', '7');
  await enter('Review and handoff tools', '4');
  await enter('1. Authorize export', '1');
  await enter('Evidence in this export', '1');
  await enter('Export format', '2');
  await enter('Output name under exports/ (optional)', 'native-terminal-review.zip');
  await waitFor('Exported exports/');
  await enter('Review and handoff tools', '11');
  await enter('Choose an action', '10');
  const result = await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Terminal did not exit.')), 10000)),
  ]);
  assert.equal(result.exitCode, 0);
  assert.match(output, /'?"pending"\s*:\s*false/);
  const source = await readFile(join(project, 'deployment.yaml'), 'utf8');
  assert.ok(source.includes('Fictional native terminal revision'));
  const exported = join(project, 'exports', 'native-terminal-review.zip');
  assert.ok((await stat(exported)).size > 0);
  assert.equal((await readFile(exported)).subarray(0, 2).toString(), 'PK');
  const report = {
    verifiedAt: new Date().toISOString(),
    os: process.platform,
    arch: process.arch,
    node: process.version,
    ptyProvider: 'node-pty 1.1.0',
    steps: 5,
    saved: true,
    zipExported: true,
    exitCode: result.exitCode,
    pending: false,
  };
  await finishTerminalVerification({ reportPath: values.report, report, exitCode: 0 });
} catch (error) {
  await finishTerminalVerification({
    reportPath: values.report,
    report: {
      verifiedAt: new Date().toISOString(),
      os: process.platform,
      node: process.version,
      passed: false,
      error: error.message,
      terminalExit: exitResult,
      outputTail: output.slice(-6000),
    },
    exitCode: 1,
    cleanup: async () => {
      if (exitResult) return;
      if (process.platform === 'win32') {
        if (!Number.isSafeInteger(terminal.pid) || terminal.pid <= 0)
          throw new Error('Invalid owned PTY PID.');
        await new Promise((resolve, reject) =>
          execFile('taskkill', ['/PID', String(terminal.pid), '/T', '/F'], { timeout: 5000 }, (error) =>
            error && !exitResult ? reject(error) : resolve(),
          ),
        );
      } else terminal.kill();
    },
  });
}
