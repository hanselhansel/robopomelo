import { expect, it } from 'vitest';
import { decodeAttachment } from '../../apps/desktop/src/parser-decode.js';

it('rejects malformed bytes before loading a browser decoder and returns no diagnostic data', async () => {
  const result = await decodeAttachment({
    jobId: 'fixture',
    generation: 1,
    format: 'pdf',
    bytes: new Uint8Array([1, 2, 3]),
  });
  expect(result).toEqual({
    jobId: 'fixture',
    generation: 1,
    state: 'failed',
    textExcerpt: '',
    pageCount: 0,
    pageImages: [],
    warnings: ['PARSE_FAILED'],
  });
});

it('rejects a declared format mismatch before invoking browser decoding', async () => {
  const result = await decodeAttachment({
    jobId: 'fixture',
    generation: 2,
    format: 'png',
    bytes: new TextEncoder().encode('%PDF-1.7\n'),
  });
  expect(result.state).toBe('failed');
  expect(result.pageImages).toEqual([]);
});
