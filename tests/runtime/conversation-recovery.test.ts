import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, realpath, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
import { ConversationStore, CONVERSATION_STORE_LIMIT } from '../../packages/project-fs/src/conversations/store.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function store(id = 'main') {
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'rp-conversation-')));
  cleanup.push(() => rm(folder, { recursive: true, force: true }));
  const root = await SafeRoot.open(folder);
  cleanup.push(() => root.close());
  return { folder, root, store: new ConversationStore(root, id) };
}
const event = (sequence: number, text = 'turn ' + sequence) => ({ kind: 'user', sequence, at: 't', text, attachmentIds: [], answer: null, base: { sourceRevision: 'r', sourceHash: 'c'.repeat(64) } });
it('appends immutable events, replays them in order and tolerates an identical retry', async () => {
  const s = await store();
  for (let i = 1; i <= 3; i++) await s.store.append(event(i));
  await s.store.append(event(2));
  await expect(s.store.append(event(2, 'different'))).rejects.toMatchObject({ code: 'HISTORY_TAMPERED' });
  await expect(s.store.append(event(5))).rejects.toMatchObject({ code: 'SEQUENCE_INVALID' });
  const loaded = await s.store.load();
  expect(loaded.checkpoint).toBeNull();
  expect(loaded.events.map(e => (e as { sequence: number }).sequence)).toEqual([1, 2, 3]);
  expect(loaded.damaged).toEqual([]);
});
it('recovers only complete events after a damaged or missing file and never skips a gap', async () => {
  const s = await store();
  for (let i = 1; i <= 5; i++) await s.store.append(event(i));
  const damagedPath = join(s.folder, 'conversations', 'main', 'events', '00000004.json');
  await writeFile(damagedPath, (await readFile(damagedPath)).subarray(0, 20));
  const loaded = await s.store.load();
  expect(loaded.events.map(e => (e as { sequence: number }).sequence)).toEqual([1, 2, 3]);
  expect(loaded.damaged).toEqual(['conversations/main/events/00000004.json']);
  await rm(damagedPath);
  const gap = await s.store.load();
  expect(gap.events.map(e => (e as { sequence: number }).sequence)).toEqual([1, 2, 3]);
  expect(gap.damaged).toEqual([]);
  expect(gap.lastSequence).toBe(3);
});
it('starts replay from the latest valid checkpoint and ignores a damaged newer checkpoint', async () => {
  const s = await store();
  for (let i = 1; i <= 6; i++) await s.store.append(event(i));
  await s.store.checkpoint(4, { compact: 'state at 4' });
  await s.store.checkpoint(6, { compact: 'state at 6' });
  const newest = join(s.folder, 'conversations', 'main', 'checkpoints', '00000006.json');
  await writeFile(newest, 'not json');
  const loaded = await s.store.load();
  expect(loaded.checkpoint).toEqual({ sequence: 4, state: { compact: 'state at 4' } });
  expect(loaded.events.map(e => (e as { sequence: number }).sequence)).toEqual([5, 6]);
  expect(loaded.damaged).toEqual(['conversations/main/checkpoints/00000006.json']);
  await expect(s.store.checkpoint(7, {})).rejects.toMatchObject({ code: 'SEQUENCE_INVALID' });
});
it('validates conversation identity and bounds event count and size', async () => {
  const s = await store();
  expect(() => new ConversationStore(s.root, '../escape')).toThrow();
  expect(() => new ConversationStore(s.root, 'Main')).toThrow();
  await expect(s.store.append({ ...event(1), text: 'x'.repeat(70_000) })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  await expect(s.store.append({ sequence: 'one' })).rejects.toMatchObject({ code: 'SEQUENCE_INVALID' });
  expect(CONVERSATION_STORE_LIMIT).toBe(2000);
});
