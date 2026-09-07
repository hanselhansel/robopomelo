import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INGESTION_LIMITS,
  IngestionError,
  assertAttachmentBatch,
  assertPdfPageCount,
  preflightAttachment,
} from '../../packages/ingestion/src/index.js';

function png(width = 100, height = 80) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 2, 0, 0, 0], 24);
  return bytes;
}
function jpeg(width = 100, height = 80) {
  return new Uint8Array([
    255,
    216,
    255,
    192,
    0,
    17,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    3,
    1,
    17,
    0,
    2,
    17,
    0,
    3,
    17,
    0,
    255,
    217,
  ]);
}
function fails(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(IngestionError);
    expect(error).toMatchObject({ code, action: expect.any(String) });
  }
}
describe('bounded attachment preflight', () => {
  it('publishes fixed initial limits', () => {
    expect(DEFAULT_INGESTION_LIMITS).toEqual({
      maxFiles: 20,
      maxFileBytes: 25 * 1024 ** 2,
      maxTotalBytes: 100 * 1024 ** 2,
      maxPdfPages: 100,
      maxImagePixels: 20_000_000,
    });
  });
  it('detects PDF from bytes, not a misleading extension, without claiming extraction', () => {
    expect(
      preflightAttachment({
        displayName: 'floor.png',
        bytes: new TextEncoder().encode('%PDF-1.7\n1 0 obj\n'),
      }),
    ).toMatchObject({ format: 'pdf', mimeType: 'application/pdf', preflightOnly: true });
  });
  it('sanitizes private paths and control characters for display', () => {
    expect(
      preflightAttachment({ displayName: '/Users/private/floor\u202e\n.png', bytes: png() }).displayName,
    ).toBe('floor.png');
    expect(preflightAttachment({ displayName: 'C:\\private\\floor.png', bytes: png() }).displayName).toBe(
      'floor.png',
    );
  });
  it('reads PNG and JPEG dimensions before decoding', () => {
    for (const bytes of [png(), jpeg()])
      expect(preflightAttachment({ displayName: 'floor', bytes }).dimensions).toEqual({
        width: 100,
        height: 80,
      });
  });
  it('rejects unsupported and truncated magic/header bytes', () => {
    fails(
      () => preflightAttachment({ displayName: 'secret.pdf', bytes: new Uint8Array([1, 2, 3]) }),
      'ATTACHMENT_UNSUPPORTED_FORMAT',
    );
    for (const bytes of [png().slice(0, 28), jpeg().slice(0, 15), new TextEncoder().encode('%PDF-')]) {
      fails(() => preflightAttachment({ displayName: 'floor', bytes }), 'ATTACHMENT_MALFORMED_HEADER');
    }
  });
  it('rejects unsafe dimensions and invalid PNG format headers', () => {
    fails(
      () => preflightAttachment({ displayName: 'floor', bytes: png(0, 1) }),
      'ATTACHMENT_MALFORMED_HEADER',
    );
    for (const bytes of [png(5000, 4001), jpeg(5000, 4001)]) {
      fails(() => preflightAttachment({ displayName: 'floor', bytes }), 'ATTACHMENT_IMAGE_TOO_LARGE');
    }
    const bad = png();
    bad[26] = 1;
    fails(() => preflightAttachment({ displayName: 'floor', bytes: bad }), 'ATTACHMENT_MALFORMED_HEADER');
  });
  it('rejects file count, individual size and aggregate size before bytes are read', () => {
    assertAttachmentBatch([]);
    assertAttachmentBatch(Array.from({ length: 4 }, () => ({ byteLength: 25 * 1024 ** 2 })));
    fails(
      () => assertAttachmentBatch(Array.from({ length: 21 }, () => ({ byteLength: 1 }))),
      'ATTACHMENT_TOO_MANY_FILES',
    );
    fails(() => assertAttachmentBatch([{ byteLength: 25 * 1024 ** 2 + 1 }]), 'ATTACHMENT_FILE_TOO_LARGE');
    fails(
      () => assertAttachmentBatch(Array.from({ length: 5 }, () => ({ byteLength: 25 * 1024 ** 2 }))),
      'ATTACHMENT_TOTAL_TOO_LARGE',
    );
    for (const byteLength of [0, -1, NaN, Infinity, 1.1])
      fails(() => assertAttachmentBatch([{ byteLength }]), 'ATTACHMENT_INVALID_SIZE');
  });
  it('handles typed-array slices and skips bounded JPEG metadata segments', () => {
    const padded = new Uint8Array(50);
    padded.set(png(), 7);
    expect(preflightAttachment({ displayName: 'x', bytes: padded.subarray(7, 40) }).dimensions).toEqual({
      width: 100,
      height: 80,
    });
    const source = jpeg();
    const metadata = new Uint8Array(source.length + 6);
    metadata.set([255, 216, 255, 225, 0, 4, 12, 34]);
    metadata.set(source.subarray(2), 8);
    expect(preflightAttachment({ displayName: 'x', bytes: metadata }).dimensions).toEqual({
      width: 100,
      height: 80,
    });
    for (const bytes of [
      new Uint8Array([255, 216, 255, 225, 255, 255]),
      new Uint8Array([255, 216, 255, 225, 0, 0]),
      new Uint8Array([255, 216, 255, 255]),
    ]) {
      fails(() => preflightAttachment({ displayName: 'x', bytes }), 'ATTACHMENT_MALFORMED_HEADER');
    }
  });
  it('checks actual byte length independently from metadata', () => {
    fails(
      () => preflightAttachment({ displayName: 'floor', bytes: new Uint8Array(25 * 1024 ** 2 + 1) }),
      'ATTACHMENT_FILE_TOO_LARGE',
    );
  });
  it('bounds decoded PDF page count without claiming PDF header knows the count', () => {
    assertPdfPageCount(100);
    fails(() => assertPdfPageCount(101), 'ATTACHMENT_PDF_TOO_MANY_PAGES');
    for (const count of [0, -1, NaN, 1.5])
      fails(() => assertPdfPageCount(count), 'ATTACHMENT_INVALID_PAGE_COUNT');
  });
});
