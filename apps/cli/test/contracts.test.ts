import { afterEach, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { commandRegistry, parseCommand } from '../src/arguments.js';
import { executeCommand, handlers, resultEnvelope } from '../src/dispatch.js';
import { exitForError, errorEnvelope } from '../src/output.js';
import { fixture } from './helpers/commands.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()));
});
async function host() {
  const f = await fixture();
  cleanup.push(f.close);
  return f;
}
it('has an implemented adapter for every registered command leaf', () => {
  expect([...Object.keys(handlers), 'open', 'init', 'plan'].sort()).toEqual(
    commandRegistry.map((c) => c.name).sort(),
  );
});
it('every finite leaf returns or reports an actionable error without prompting on closed stdin', async () => {
  const f = await host();
  for (const item of commandRegistry) {
    if (item.name === 'open' || item.name === 'plan') continue;
    const command = parseCommand([...item.name.split(' '), '--project', f.path, '--json']);
    try {
      await executeCommand(command, { ...f.context, stdin: Readable.from([]) });
    } catch (error) {
      expect((error as { code?: string }).code).not.toBe('UNSUPPORTED_COMMAND');
      expect((error as { code?: string }).code).not.toBeUndefined();
    }
  }
});
it('keeps blocked validation a single JSON object with exact source metadata', async () => {
  const f = await host();
  const result = await f.run(['validate', '--json']),
    envelope = resultEnvelope('validate', result, '1.0.0');
  const bytes = JSON.stringify(envelope) + '\n';
  expect(JSON.parse(bytes)).toMatchObject({
    formatVersion: '1.0.0',
    command: 'validate',
    ok: false,
    sourceHash: result.snapshot!.sourceHash,
    sourceRevision: result.snapshot!.sourceRevision,
    specVersion: '1.0.0',
  });
  expect(bytes).not.toMatch(/\u001b\[/);
  expect(envelope.findings.length).toBeGreaterThan(0);
});
it('uses semantic exit codes for actual input, conflict, authority, I/O and unsupported operations', async () => {
  const f = await host();
  const bad = [
    { args: ['patch', 'check', '-', '--authorize', 'author'], input: '{', code: 2 },
    { args: ['patch', 'apply', '-'], input: await f.patch(), code: 5 },
    { args: ['patch', 'check', 'missing.json', '--authorize', 'author'], code: 6 },
    { args: ['migrate', '--target', '2.0.0'], code: 7 },
    { args: ['update', 'check'], code: 7 },
  ];
  for (const item of bad) {
    try {
      await f.run(item.args, item.input);
      throw new Error('Expected failure');
    } catch (error) {
      expect(exitForError(error)).toBe(item.code);
      expect(errorEnvelope(item.args.join(' '), error, '1.0.0').ok).toBe(false);
    }
  }
  const patch = await f.patch();
  await f.run(['patch', 'apply', '-', '--authorize', 'author'], patch);
  const conflict = await f.run(['patch', 'apply', '-', '--authorize', 'author'], {
    ...patch,
    id: 'another-change',
  });
  expect(conflict.exitCode).toBe(4);
  expect(resultEnvelope('patch apply', conflict, '1.0.0').ok).toBe(false);
});
it('rejects a non-TTY wizard before invoking any injected workflow callback', async () => {
  const f = await host();
  let called = false;
  await expect(
    executeCommand(parseCommand(['plan']), {
      ...f.context,
      isTTY: false,
      plan: async () => {
        called = true;
        return { data: { status: 'cancelled' } };
      },
    }),
  ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  expect(called).toBe(false);
});
it('routes open and TTY plan to their explicitly supplied application callbacks', async () => {
  const f = await host();
  const opened = await executeCommand(parseCommand(['open']), {
    ...f.context,
    open: async () => ({ data: { status: 'opened' } }),
  });
  expect(opened.data).toEqual({ status: 'opened' });
  const planned = await executeCommand(parseCommand(['plan']), {
    ...f.context,
    isTTY: true,
    plan: async () => ({ data: { status: 'cancelled' } }),
  });
  expect(planned.data).toEqual({ status: 'cancelled' });
});
it('initializes an example without overwriting a nonempty target', async () => {
  const f = await host();
  const target = join(f.root, 'new project');
  const result = await executeCommand(
    parseCommand(['init', target, '--example', 'inbound-pallet', '--authorize', 'author']),
    f.context,
  );
  expect(result.snapshot?.deployment.extensions['robopomelo.example']).toEqual({ fictional: true });
  await writeFile(join(target, 'keep.txt'), 'keep');
  await expect(
    executeCommand(parseCommand(['init', target, '--authorize', 'author']), f.context),
  ).rejects.toThrow();
});
import { updaterFixture } from './helpers/updater.js';
it('routes actual updater commands and classifies explicit transport failure as exit eight', async () => {
  const f = await host(),
    runtime = await updaterFixture(f.root, f.project);
  const run = (argv: string[]) =>
    executeCommand(parseCommand(argv), { ...f.context, updater: runtime.updater });
  expect((await run(['update', 'check', '--offline'])).data).toMatchObject({ status: 'not-checked' });
  expect(runtime.requests).toEqual([]);
  expect((await run(['update', 'check'])).data).toMatchObject({ status: 'available' });
  expect(
    (await run(['update', 'install', '--target', '1.1.0', '--authorize', 'manage-settings'])).data,
  ).toMatchObject({
    status: 'installed',
    version: '1.1.0',
  });
  expect((await run(['update', 'rollback', '--authorize', 'manage-settings'])).data).toMatchObject({
    status: 'rolled-back',
    version: '1.0.0',
  });
  expect(
    (await run(['update', 'configure', '--resume', '--authorize', 'manage-settings'])).data,
  ).toHaveProperty('policy.rollbackHold', null);
  const other = await host(),
    broken = await updaterFixture(other.root, other.project, true);
  try {
    await executeCommand(parseCommand(['update', 'check']), { ...other.context, updater: broken.updater });
    throw new Error('Expected failed request');
  } catch (error) {
    expect(exitForError(error)).toBe(8);
  }
});
import { stat } from 'node:fs/promises';
it('requires explicit author authority for CLI init even with --yes and JSON', async () => {
  const f = await host(),
    target = join(f.root, 'unauthorized-create');
  await expect(
    executeCommand(parseCommand(['init', target, '--yes', '--json']), f.context),
  ).rejects.toMatchObject({ code: 'SCOPE_REQUIRED' });
  await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(
    (await executeCommand(parseCommand(['init', target, '--authorize', 'author', '--json']), f.context)).data,
  ).toMatchObject({ status: 'created' });
});
it('doctor keeps original launcher identity separate from the current tool version', async () => {
  const f = await host();
  const result = await executeCommand(parseCommand(['doctor']), {
    ...f.context,
    launcherVersion: '0.9.0',
    bundledRuntimeVersion: '0.9.0',
  });
  expect(result.data).toMatchObject({
    toolVersion: '1.0.0',
    launcherVersion: '0.9.0',
    bundledRuntimeVersion: '0.9.0',
    selectedRuntimeVersion: '1.0.0',
  });
});
it('keeps a proposal envelope bound to its unchanged source base and candidate validation separate', async () => {
  const f = await host();
  await f.project.grant(['author'], 'review-each-change', true);
  const patch = await f.patch(),
    result = await f.run(['patch', 'apply', '-'], patch),
    envelope = resultEnvelope('patch apply', result, '1.0.0');
  expect(envelope).toMatchObject({ sourceRevision: patch.baseRevision, sourceHash: patch.baseHash });
  expect(envelope.data).toMatchObject({ status: 'proposed', validation: { sourceHash: null } });
});
it('reports an evidence retry from the runtime receipt rather than inferring a second copy', async () => {
  const f = await host(),
    s = await f.project.snapshot(),
    file = join(f.root, 'retry-evidence.txt');
  await writeFile(file, 'supplied bytes');
  const args = [
    'evidence',
    'add',
    file,
    '--purpose',
    'planning',
    '--title',
    'Retry source',
    '--provenance',
    'Supplied file',
    '--base-revision',
    s.sourceRevision,
    '--base-hash',
    s.sourceHash,
    '--change',
    'repeatable-evidence',
    '--actor',
    JSON.stringify({ kind: 'human', name: 'Engineer' }),
    '--authorize',
    'author,evidence',
  ];
  const first = await f.run(args),
    second = await f.run(args);
  expect(first.data).toMatchObject({ status: 'applied' });
  expect(second.data).toMatchObject({ status: 'already-applied' });
  expect(second.snapshot?.sourceHash).toBe(first.snapshot?.sourceHash);
  expect(second.snapshot?.deployment.evidence).toHaveLength(1);
});
it('requires manage-settings for explicit install before any updater request or cache creation', async () => {
  const f = await host(),
    runtime = await updaterFixture(f.root, f.project);
  await expect(
    executeCommand(parseCommand(['update', 'install', '1.1.0', '--yes', '--json']), {
      ...f.context,
      updater: runtime.updater,
    }),
  ).rejects.toMatchObject({ code: 'SCOPE_REQUIRED' });
  expect(runtime.requests).toEqual([]);
  await expect(stat(join(f.root, 'runtime-cache'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('checks evidence-copy scope before inspecting an external file path', async () => {
  const f = await host(),
    s = await f.project.snapshot();
  await expect(
    f.run([
      'evidence',
      'add',
      join(f.root, 'missing-private-file'),
      '--purpose',
      'planning',
      '--title',
      'Selected source',
      '--provenance',
      'Supplied source',
      '--base-revision',
      s.sourceRevision,
      '--base-hash',
      s.sourceHash,
      '--actor',
      JSON.stringify({ kind: 'human', name: 'Engineer' }),
      '--authorize',
      'author',
    ]),
  ).rejects.toMatchObject({ code: 'SCOPE_REQUIRED' });
});
