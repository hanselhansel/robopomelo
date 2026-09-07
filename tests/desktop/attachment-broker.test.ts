import { mkdtemp, realpath, writeFile, rm, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { AttachmentBroker } from '../../apps/desktop/src/attachment-broker.js';
import { PreviewStore } from '../../apps/desktop/src/preview-protocol.js';
const png = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
    'base64',
  ),
);
const response = () => ({
  jobId: 'test',
  generation: 0,
  state: 'parsed' as const,
  textExcerpt: 'Dock',
  pageCount: 1,
  pageImages: [png],
  warnings: [],
});
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(parse = vi.fn(async () => response())) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'rp-attachment-broker-')));
  roots.push(root);
  const path = join(root, 'floor.png');
  await writeFile(path, png);
  let context = '0';
  const previews = new PreviewStore();
  const broker = new AttachmentBroker({ context: () => context, previews, parse });
  return {
    broker,
    path,
    previews,
    parse,
    switch: () => {
      context = '1';
    },
  };
}
it('retains selected files across chooser cancellation and reuses a parsed snapshot', async () => {
  const f = await fixture();
  const [selected] = await f.broker.select([f.path]);
  expect(await f.broker.select([])).toEqual([]);
  const preview = await f.broker.inspect(selected!.selectionId);
  expect(preview).toMatchObject({ state: 'parsed', textExcerpt: 'Dock' });
  expect(preview).not.toHaveProperty('path');
  expect(f.previews.read(preview.pagePreviewIds[0]!, '0')).toEqual(png);
  expect(await f.broker.inspect(selected!.selectionId)).toEqual(preview);
  expect(f.parse).toHaveBeenCalledTimes(1);
  f.broker.clear();
});
it('rejects replaced selection context and revokes its previews', async () => {
  const f = await fixture();
  const [selected] = await f.broker.select([f.path]);
  const preview = await f.broker.inspect(selected!.selectionId);
  f.switch();
  await expect(f.broker.inspect(selected!.selectionId)).rejects.toThrow('ATTACHMENT_SELECTION_UNKNOWN');
  expect(() => f.previews.read(preview.pagePreviewIds[0]!, '1')).toThrow();
});
it('drops results arriving after cancellation, even if a decoder ignores abort', async () => {
  let finish!: () => void;
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const parse = vi.fn(async () => {
    started();
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return response();
  });
  const f = await fixture(parse);
  const [selected] = await f.broker.select([f.path]);
  const result = f.broker.inspect(selected!.selectionId);
  const rejected = expect(result).rejects.toThrow('ATTACHMENT_CANCELLED');
  await running;
  f.broker.cancel(selected!.selectionId);
  finish();
  await rejected;
  expect(() => f.previews.read('anything', '0')).toThrow();
});
it('enforces aggregate selection count and preserves a failed file for retry', async () => {
  const parse = vi.fn(async () => {
    throw new Error('/private/path must not leak');
  });
  const f = await fixture(parse);
  await expect(f.broker.select(Array.from({ length: 21 }, () => f.path))).rejects.toThrow();
  const [selected] = await f.broker.select([f.path]);
  const result = await f.broker.inspect(selected!.selectionId);
  expect(result).toMatchObject({ state: 'failed', warnings: ['ATTACHMENT_PARSE_FAILED'] });
  expect(JSON.stringify(result)).not.toContain('/private');
  parse.mockImplementation(async () => response() as never);
  expect((await f.broker.inspect(selected!.selectionId)).state).toBe('parsed');
  f.broker.clear();
});

it('awaits owned parsing during close and rejects future selection', async () => {
  let finish!: () => void, started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const f = await fixture(
    vi.fn(async () => {
      started();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return response();
    }),
  );
  const [selected] = await f.broker.select([f.path]);
  const pending = f.broker.inspect(selected!.selectionId);
  const rejected = expect(pending).rejects.toThrow();
  await running;
  let closed = false;
  const closing = f.broker.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  finish();
  await closing;
  await rejected;
  await expect(f.broker.select([])).rejects.toThrow('ATTACHMENT_BROKER_CLOSED');
});

it('retains unsupported input with a specific state without dispatching the decoder', async () => {
  const f = await fixture();
  await writeFile(f.path, 'Unsupported document content');
  const [selected] = await f.broker.select([f.path]);
  expect(await f.broker.inspect(selected!.selectionId)).toMatchObject({
    state: 'unsupported',
    warnings: ['ATTACHMENT_UNSUPPORTED_FORMAT'],
  });
  expect(f.parse).not.toHaveBeenCalled();
  f.broker.clear();
});

it('limits concurrent parsers to two while completing queued files', async () => {
  const release: (() => void)[] = [];
  let active = 0,
    peak = 0;
  const parse = vi.fn(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => release.push(resolve));
    active--;
    return response();
  });
  const f = await fixture(parse);
  const selected = await f.broker.select(Array.from({ length: 4 }, () => f.path));
  const pending = selected.map((row) => f.broker.inspect(row.selectionId));
  await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(2));
  release.splice(0).forEach((resolve) => resolve());
  await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(4));
  release.splice(0).forEach((resolve) => resolve());
  await Promise.all(pending);
  expect(peak).toBe(2);
  await f.broker.close();
});

it('reserves the 100 MiB aggregate budget across separate chooser calls', async () => {
  const f = await fixture();
  await truncate(f.path, 25 * 1024 ** 2);
  await f.broker.select(Array.from({ length: 4 }, () => f.path));
  await expect(f.broker.select([f.path])).rejects.toMatchObject({ code: 'ATTACHMENT_TOTAL_TOO_LARGE' });
  expect(f.parse).not.toHaveBeenCalled();
  f.broker.clear();
});

it('collects immutable selected bytes for confirmed import without exposing file paths', async () => {
  const f = await fixture();
  const [picked] = await f.broker.select([f.path]);
  const inputs = await f.broker.collect([picked!.selectionId]);
  expect(inputs[0]).toMatchObject({ id: picked!.selectionId, name: 'floor.png', bytes: png });
  expect(inputs[0]).not.toHaveProperty('path');
  inputs[0]!.bytes[0] = 0;
  expect((await f.broker.collect([picked!.selectionId]))[0]!.bytes[0]).toBe(137);
  f.switch();
  await expect(f.broker.collect([picked!.selectionId])).rejects.toThrow();
});
