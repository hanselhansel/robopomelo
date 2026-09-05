import { afterEach, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInput } from '../src/input.js';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
it('reads exactly one JSON value from explicit stdin while preserving false, zero and null', async () => {
  expect(await readInput('-', Readable.from(['{"flag":false,"value":0,"unknown":null}']))).toEqual({
    flag: false,
    value: 0,
    unknown: null,
  });
});
it('reads a specifically named file without consuming stdin', async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'rp-input-')));
  roots.push(folder);
  const path = join(folder, '- patch 文件.json');
  await writeFile(path, '{"data":"preserved"}');
  const input = new Readable({
    read() {
      throw new Error('stdin must not be read');
    },
  });
  expect(await readInput(path, input)).toEqual({ data: 'preserved' });
});
it('rejects malformed UTF-8, trailing JSON, excess bytes and excessive nesting', async () => {
  for (const bytes of [Buffer.from([0xff]), Buffer.from('{} {}'), Buffer.from('')])
    await expect(readInput('-', Readable.from([bytes]))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(readInput('-', Readable.from(['x'.repeat(100)]), { maxBytes: 10 })).rejects.toMatchObject({
    code: 'INVALID_INPUT',
  });
  await expect(
    readInput('-', Readable.from(['['.repeat(100) + '0' + ']'.repeat(100)])),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});
it('bounds a never-ending stdin wait instead of treating input as confirmation', async () => {
  const input = new Readable({ read() {} });
  await expect(readInput('-', input, { timeoutMs: 10 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  input.destroy();
});
