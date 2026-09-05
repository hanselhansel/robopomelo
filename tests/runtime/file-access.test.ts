import { expect, it } from 'vitest';
import { FileAccess } from '../../packages/project-fs/src/fs/file-access.js';
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
it('serializes a source replacement behind its active reader and preserves queue order', async () => {
  const access = new FileAccess();
  const held = deferred();
  const entered = deferred();
  const events: string[] = [];
  const reader = access.run('deployment.yaml', async () => {
    events.push('read');
    entered.release();
    await held.promise;
    events.push('close');
  });
  await entered.promise;
  const replacement = access.run('deployment.yaml', async () => {
    events.push('replace');
  });
  const nextReader = access.run('deployment.yaml', async () => {
    events.push('next-read');
  });
  await Promise.resolve();
  expect(events).toEqual(['read']);
  held.release();
  await Promise.all([reader, replacement, nextReader]);
  expect(events).toEqual(['read', 'close', 'replace', 'next-read']);
});
it('allows independent files to progress while a source read is active', async () => {
  const access = new FileAccess();
  const held = deferred();
  const entered = deferred();
  const reader = access.run('deployment.yaml', async () => {
    entered.release();
    await held.promise;
  });
  await entered.promise;
  expect(await access.run('evidence/notes.txt', async () => 'independent')).toBe('independent');
  held.release();
  await reader;
});
it('releases queued work after an operation fails', async () => {
  const access = new FileAccess();
  const held = deferred();
  const entered = deferred();
  const error = new Error('read failed');
  const first = access.run('deployment.yaml', async () => {
    entered.release();
    await held.promise;
    throw error;
  });
  await entered.promise;
  const rejection = expect(first).rejects.toBe(error);
  const second = access.run('deployment.yaml', async () => 'completed');
  held.release();
  await rejection;
  expect(await second).toBe('completed');
});
