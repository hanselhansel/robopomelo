import { expect, it } from 'vitest';
import { checkedParserRequest, checkedParserResponse } from '../../apps/desktop/src/parser-contracts.js';
const request = {
  jobId: 'job-1',
  generation: 1,
  format: 'pdf',
  bytes: new TextEncoder().encode('%PDF-1.7\n'),
};
const response = {
  jobId: 'job-1',
  generation: 1,
  state: 'parsed',
  textExcerpt: 'Receiving dock',
  pageCount: 1,
  pageImages: [],
  warnings: [],
};
it('accepts a bounded selected-byte request and closed parser response', () => {
  expect(checkedParserRequest(request)).toEqual(request);
  expect(checkedParserResponse(response, request)).toEqual(response);
});
it('rejects foreign, stale and expanded parser responses', () => {
  for (const change of [
    { jobId: 'other' },
    { generation: 0 },
    { filePath: '/private/secret' },
    { warnings: ['arbitrary message'] },
    { pageCount: 101 },
  ]) {
    expect(() => checkedParserResponse({ ...response, ...change }, request)).toThrow();
  }
});
it('rejects oversized output and non-PNG preview bytes', () => {
  for (const change of [
    { textExcerpt: 'a'.repeat(100001) },
    { pageImages: [new Uint8Array([1, 2, 3])] },
    { pageImages: Array.from({ length: 4 }, () => new Uint8Array()) },
  ]) {
    expect(() => checkedParserResponse({ ...response, ...change }, request)).toThrow();
  }
});
it('rejects invalid generations, excess input and content-format mismatch', () => {
  for (const change of [
    { generation: NaN },
    { generation: -1 },
    { generation: 1.2 },
    { bytes: new Uint8Array(25 * 1024 ** 2 + 1) },
    { format: 'png' },
    { jobId: '' },
    { path: '/private/file.pdf' },
  ]) {
    expect(() => checkedParserRequest({ ...request, ...change })).toThrow();
  }
});
