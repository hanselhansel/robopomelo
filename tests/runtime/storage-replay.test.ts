import { expect, it, vi } from 'vitest';
import { mkdtemp, realpath, rm, mkdir, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { initializeProject } from '../../packages/project-fs/src/init.js';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
import { SettingsStore } from '../../packages/project-fs/src/settings/store.js';
import { TrustStore } from '../../packages/project-fs/src/settings/trust.js';
import { ProjectSession } from '../../packages/project-fs/src/session.js';
import { commitInput, snapshot } from './helpers/session-fixture.js';
import type { Deployment, PatchOperation } from '@robopomelo/spec';
import fixture from './fixtures/windows-save.json';

it('replays the captured Windows save while source observers read concurrently', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'rp-storage-replay-')));
  const project = join(directory, 'project');
  const deployment = fixture.deployment as Deployment;
  await initializeProject(project, deployment, ['author']);
  const root = await SafeRoot.open(project);
  const trust = new TrustStore(new SettingsStore(join(directory, 'config')));
  const authorization = trust.authorizeRun(
    { ...root.identity(), projectId: deployment.project.id },
    ['inspect', 'author'],
    'autonomous',
  );
  let phase = 'before-journal';
  const failures: { method: string; code?: string; syscall?: string; phase: string }[] = [];
  const methods = [
    'readFile',
    'createExclusive',
    'fsyncDirectory',
    'renameReplace',
    'removeOwnedEntry',
  ] as const;
  const spies = methods.map((method) => {
    const original = root[method].bind(root) as (...args: unknown[]) => Promise<unknown>;
    return vi.spyOn(root, method).mockImplementation((async (...args: unknown[]) => {
      try {
        return await original(...args);
      } catch (error) {
        const e = error as NodeJS.ErrnoException;
        failures.push({
          method,
          phase,
          ...(e.code ? { code: e.code } : {}),
          ...(e.syscall ? { syscall: e.syscall } : {}),
        });
        if (failures.length > 64) failures.shift();
        throw error;
      }
    }) as never);
  });
  const session = new ProjectSession({
    root,
    trust,
    authorization,
    projectId: deployment.project.id,
    toolVersion: '1.0.0',
    id: randomUUID,
    clock: () => new Date().toISOString(),
    onProgress: (event) => {
      phase = event.phase;
    },
  });
  let stopped = false;
  let observations = 0;
  const reader = (async () => {
    while (!stopped) {
      try {
        await root.readFile('deployment.yaml');
        observations++;
      } catch {
        /* The real source-identity endpoint reports transient unavailability. */
      }
      await pause(2);
    }
  })();
  let lastInput;
  try {
    let current = await snapshot(session);
    const operations = fixture.operations as PatchOperation[];
    const remove: PatchOperation[] = operations.map((op) => {
      if (op.op !== 'add') throw new Error('Captured fixture must contain only record additions.');
      return { op: 'remove', collection: op.collection, id: (op.record as { id: string }).id };
    });
    const cycles = process.platform === 'win32' ? 100 : 3;
    for (let cycle = 0; cycle < cycles; cycle++) {
      for (const ops of [operations, remove]) {
        phase = 'before-journal';
        lastInput = commitInput(current, randomUUID(), authorization, ops);
        const committed = await session.commit(lastInput);
        expect(committed.kind).toBe('committed');
        if (committed.kind !== 'committed') throw new Error('Replay did not commit.');
        expect(committed.snapshot.deployment.meta.parentRevisionId).toBe(current.sourceRevision);
        current = committed.snapshot;
      }
    }
    expect(observations).toBeGreaterThan(0);
    expect(current.deployment.kpis).toEqual(deployment.kpis);
    expect(current.deployment.challengeAnswers).toEqual(deployment.challengeAnswers);
  } catch (error) {
    stopped = true;
    await reader;
    const e = error as NodeJS.ErrnoException;
    const output = resolve('test-results', `storage-replay-${process.platform}-${process.version}`);
    await mkdir(output, { recursive: true });
    await writeFile(
      join(output, 'failure.json'),
      JSON.stringify(
        { phase, failures, code: e.code, syscall: e.syscall, mutationId: lastInput?.idempotencyKey },
        null,
        2,
      ),
    );
    // Only this synthetic fixture's project is retained. Its config/session is excluded.
    await cp(project, join(output, 'project'), { recursive: true });
    // Artifact upload omits dot-directories. Retain this synthetic metadata visibly too.
    await cp(join(project, '.robopomelo'), join(output, 'project-metadata'), { recursive: true });
    throw error;
  } finally {
    stopped = true;
    await reader;
    for (const spy of spies) spy.mockRestore();
    await session.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 180000);
