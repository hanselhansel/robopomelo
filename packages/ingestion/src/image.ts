import { DEFAULT_INGESTION_LIMITS, IngestionError } from './limits.js';
export interface ImageDimensions { width: number; height: number }
export function malformedHeader(): never {
  throw new IngestionError('ATTACHMENT_MALFORMED_HEADER', 'The file header is malformed or incomplete.', 'Export the file again as PDF, PNG or JPEG.');
}
function dimensions(width: number, height: number): ImageDimensions {
  if (width === 0 || height === 0) malformedHeader();
  if (width * height > DEFAULT_INGESTION_LIMITS.maxImagePixels) throw new IngestionError('ATTACHMENT_IMAGE_TOO_LARGE', 'The image exceeds 20 megapixels.', 'Resize the image before selecting it again.');
  return { width, height };
}
/** Header preflight only. The isolated image decoder must validate the full stream. */
export function inspectPng(bytes: Uint8Array): ImageDimensions {
  if (bytes.length < 33) malformedHeader();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) malformedHeader();
  const depth = bytes[24]!; const color = bytes[25]!;
  const allowed: Record<number, readonly number[]> = { 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] };
  if (!allowed[color]?.includes(depth) || bytes[26] !== 0 || bytes[27] !== 0 || (bytes[28] !== 0 && bytes[28] !== 1)) malformedHeader();
  return dimensions(view.getUint32(16), view.getUint32(20));
}
/** Segment traversal never decodes pixels and is bounded by the file-size limit. */
export function inspectJpeg(bytes: Uint8Array): ImageDimensions {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) malformedHeader();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0 || marker === 0xd8 || marker === 0xd9 || marker === 0xda) malformedHeader();
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) malformedHeader();
    const length = bytes[offset]! * 256 + bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) malformedHeader();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) malformedHeader();
      const components = bytes[offset + 7]!;
      if (![1,3,4].includes(components) || length !== 8 + 3 * components || bytes[offset + 2] !== 8) malformedHeader();
      return dimensions(bytes[offset + 5]! * 256 + bytes[offset + 6]!, bytes[offset + 3]! * 256 + bytes[offset + 4]!);
    }
    offset += length;
  }
  return malformedHeader();
}
