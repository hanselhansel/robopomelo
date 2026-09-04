import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { sessionFixture, snapshot, commitInput } from './helpers/session-fixture.js';
import { mutationDigest, byteHash, digestValue } from '../../packages/project-fs/src/transactions/digest.js';
import { transactionBase, jsonWrite, jsonRead } from '../../packages/project-fs/src/transactions/io.js';
import type { CommitInput } from '../../packages/project-fs/src/contracts.js';
const cleanup: (() => Promise<void>)[] = [];
let executable: string;
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rp-session-worker-'));
  executable = join(directory, 'worker.cjs');
  await build({
    entryPoints: [new URL('./helpers/session-child.ts', import.meta.url).pathname],
    outfile: executable,
    bundle: true,
    platform: 'node',
    format: 'cjs',
  });
  return async () => {
    await rm(directory, { recursive: true, force: true });
  };
});
async function fixture(...args: Parameters<typeof sessionFixture>) {
  const f = await sessionFixture(...args);
  cleanup.push(f.close);
  return f;
}
async function crash(f: Awaited<ReturnType<typeof fixture>>, input: CommitInput, phase: string) {
  const worker = fork(executable, [f.path, join(f.base, 'child-config'), phase], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  cleanup.push(async () => {
    if (worker.exitCode === null && worker.signalCode === null) {
      const stopped = once(worker, 'exit');
      worker.kill('SIGKILL');
      await stopped;
    }
  });
  await once(worker, 'message');
  const stopped = once(worker, 'exit');
  worker.send(input);
  await stopped;
}
describe('transaction crash recovery', () => {
  it('preflights metadata nesting before checksum evaluation', async () => {
    const f = await fixture();
    const text =
      '{"value":' + '{"x":'.repeat(70) + '0' + '}'.repeat(70) + ',"checksum":"' + 'a'.repeat(64) + '"}';
    await writeFile(join(f.path, 'deep.json'), text);
    await expect(jsonRead(f.root, 'deep.json')).rejects.toThrow(/limit/i);
  });
  it('bounds serialized recovery metadata before creating an unreadable journal', async () => {
    const f = await fixture();
    await expect(
      jsonWrite(f.root, 'oversized.json', { value: 'x'.repeat(8 * 1024 * 1024) }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(f.root.stat('oversized.json')).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it.each([
    ['journal-flushed', 'old'],
    ['evidence-published', 'old'],
    ['source-replaced', 'new'],
    ['history-complete', 'new'],
  ])('preserves exact %s outcome across an OS process crash', async (phase, expected) => {
    const f = await fixture();
    const initial = await snapshot(f.session);
    const input = commitInput(initial, `crash-${phase}`, f.authorization);
    await crash(f, input, phase!);
    const after = await snapshot(f.session);
    expect(after.deployment.project.name).toBe(expected === 'old' ? 'Original' : 'Updated');
    expect((await f.session.recover()).find((item) => item.mutationId === input.idempotencyKey)?.kind).toBe(
      expected === 'old' ? 'uncommitted' : 'finalized',
    );
    expect((await snapshot(f.session)).sourceHash).toBe(after.sourceHash);
    expect((await f.session.mutationStatus(input.idempotencyKey, mutationDigest(input))).status).toBe(
      expected === 'old' ? 'pending' : 'committed',
    );
  });
  it('preserves unknown external source and marks recovery indeterminate', async () => {
    const f = await fixture({
      onProgress: async ({ phase }) => {
        if (phase === 'journal-flushed') throw new Error('interrupted');
      },
    });
    const input = commitInput(await snapshot(f.session), 'unknown', f.authorization);
    await expect(f.session.commit(input)).rejects.toThrow('interrupted');
    await writeFile(join(f.path, 'deployment.yaml'), 'external: [');
    expect((await f.session.recover())[0]).toMatchObject({ kind: 'indeterminate' });
    expect(await readFile(join(f.path, 'deployment.yaml'), 'utf8')).toBe('external: [');
    expect(await f.session.mutationStatus('unknown', mutationDigest(input))).toMatchObject({
      status: 'indeterminate',
    });
  });
  it('reports damaged journal snapshots without modifying source', async () => {
    const f = await fixture({
      onProgress: async ({ phase }) => {
        if (phase === 'journal-flushed') throw new Error('interrupted');
      },
    });
    const initial = await snapshot(f.session);
    const input = commitInput(initial, 'damaged', f.authorization);
    await expect(f.session.commit(input)).rejects.toThrow();
    await writeFile(join(f.path, transactionBase('damaged'), 'new.yaml'), 'bad');
    expect((await f.session.recover())[0]).toMatchObject({ kind: 'indeterminate' });
    expect(byteHash(await readFile(join(f.path, 'deployment.yaml')))).toBe(initial.sourceHash);
  });
  it('recomputes receipt binding instead of accepting a substituted digest with a recomputed envelope checksum', async () => {
    const f = await fixture({
      onProgress: async ({ phase }) => {
        if (phase === 'journal-flushed') throw new Error('interrupted');
      },
    });
    const input = commitInput(await snapshot(f.session), 'digest-tamper', f.authorization);
    await expect(f.session.commit(input)).rejects.toThrow();
    const path = `${transactionBase(input.idempotencyKey)}/journal.json`;
    const journal = (await jsonRead(f.root, path)) as Record<string, unknown>;
    journal.digest = 'b'.repeat(64);
    await writeFile(join(f.path, path), JSON.stringify({ value: journal, checksum: digestValue(journal) }));
    expect(await f.session.mutationStatus(input.idempotencyKey, 'b'.repeat(64))).toMatchObject({
      status: 'indeterminate',
    });
  });
  it('does not classify older finalized commits as indeterminate after a later commit', async () => {
    const f = await fixture();
    await f.session.commit(commitInput(await snapshot(f.session), 'first', f.authorization));
    await f.session.commit(commitInput(await snapshot(f.session), 'second', f.authorization));
    expect((await f.session.recover()).map((item) => item.kind)).toEqual(['finalized', 'finalized']);
  });
  it.each([
    ['journal-flushed', false],
    ['evidence-published', true],
    ['source-replaced', true],
  ])('handles immutable evidence publication at %s', async (phase, published) => {
    const f = await fixture();
    const initial = await snapshot(f.session);
    for (const path of ['.robopomelo', '.robopomelo/recovery', '.robopomelo/recovery/uploads'])
      await f.root.mkdir(path);
    const bytes = Buffer.from('selected evidence'),
      hash = byteHash(bytes),
      stagedPath = '.robopomelo/recovery/uploads/selection.bin',
      finalPath = 'evidence/generated-evidence.bin';
    const handle = await f.root.createExclusive(stagedPath);
    await handle.write(bytes);
    await handle.close();
    const record = {
      id: 'evidence-1',
      title: 'Source',
      description: null,
      ownerId: null,
      sourceEvidenceIds: [],
      extensions: {},
      purpose: 'planning',
      location: { kind: 'attachment', path: finalPath, sha256: hash, size: bytes.length },
      required: false,
      relatedIds: [],
      provenance: null,
    };
    const input = {
      ...commitInput(initial, `evidence-${phase}`, f.authorization, [
        { op: 'add', collection: 'evidence', record },
      ]),
      stagedEvidence: [{ evidenceId: 'evidence-1', stagedPath, finalPath, sha256: hash, size: bytes.length }],
    };
    await crash(f, input, String(phase));
    if (published) expect(await f.root.readFile(finalPath)).toEqual(bytes);
    else await expect(f.root.stat(finalPath)).rejects.toMatchObject({ code: 'ENOENT' });
    const after = await snapshot(f.session);
    expect(after.deployment.evidence).toHaveLength(phase === 'source-replaced' ? 1 : 0);
    expect((await f.session.recover()).find((item) => item.mutationId === input.idempotencyKey)?.kind).toBe(
      phase === 'source-replaced' ? 'finalized' : 'uncommitted',
    );
  });
  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'preserves a committed source after a real history permission failure',
    async () => {
      const f = await fixture({
        onProgress: async ({ phase }) => {
          if (phase === 'source-replaced') await chmod(join(f.path, '.robopomelo/history'), 0o500);
        },
      });
      const input = commitInput(await snapshot(f.session), 'permission-failure', f.authorization);
      try {
        await expect(f.session.commit(input)).rejects.toMatchObject({ code: 'EACCES' });
      } finally {
        await chmod(join(f.path, '.robopomelo/history'), 0o700);
      }
      expect((await snapshot(f.session)).deployment.project.name).toBe('Updated');
      expect((await f.session.recover())[0]).toMatchObject({ kind: 'finalized' });
    },
  );
  it('serializes real process commits and rejects the stale competing base', async () => {
    const f = await fixture();
    const initial = await snapshot(f.session);
    const workers = await Promise.all(
      [0, 1].map(async (i) => {
        const worker = fork(executable, [f.path, join(f.base, `config-${i}`), 'none'], {
          stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        });
        cleanup.push(async () => {
          if (worker.exitCode === null && worker.signalCode === null) {
            const stopped = once(worker, 'exit');
            worker.kill('SIGKILL');
            await stopped;
          }
        });
        await once(worker, 'message');
        return worker;
      }),
    );
    const results = await Promise.all(
      workers.map(async (worker, i) => {
        const result = once(worker, 'message');
        worker.send(commitInput(initial, `concurrent-${i}`, f.authorization));
        return (await result)[0] as { status: string };
      }),
    );
    expect(results.map((result) => result.status).sort()).toEqual(['committed', 'conflict']);
  });
});
