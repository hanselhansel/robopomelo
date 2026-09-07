import { assertAttachmentBatch, IngestionError } from './limits.js';
import { inspectJpeg, inspectPng, malformedHeader, type ImageDimensions } from './image.js';
export interface AttachmentPreflight {
  displayName: string;
  byteLength: number;
  format: 'pdf' | 'png' | 'jpeg';
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  preflightOnly: true;
  dimensions?: ImageDimensions;
}
function starts(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((value, index) => bytes[index] === value);
}
/** No extraction or full-file validity is implied by a successful preflight. */
export function preflightAttachment(input: { displayName: string; bytes: Uint8Array }): AttachmentPreflight {
  const { bytes } = input;
  assertAttachmentBatch([{ byteLength: bytes.byteLength }]);
  const displayName =
    (input.displayName.split(/[\\/]/).pop() ?? '')
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
      .trim()
      .slice(0, 160) || 'Attachment';
  const base = { displayName, byteLength: bytes.byteLength, preflightOnly: true as const };
  if (starts(bytes, [37, 80, 68, 70, 45])) {
    if (
      bytes.length < 9 ||
      ![49, 50].includes(bytes[5]!) ||
      bytes[6] !== 46 ||
      bytes[7]! < 48 ||
      bytes[7]! > 57 ||
      ![10, 13, 32].includes(bytes[8]!)
    )
      malformedHeader();
    return { ...base, format: 'pdf', mimeType: 'application/pdf' };
  }
  if (starts(bytes, [137, 80, 78, 71, 13, 10, 26, 10]))
    return { ...base, format: 'png', mimeType: 'image/png', dimensions: inspectPng(bytes) };
  if (starts(bytes, [255, 216]))
    return { ...base, format: 'jpeg', mimeType: 'image/jpeg', dimensions: inspectJpeg(bytes) };
  throw new IngestionError(
    'ATTACHMENT_UNSUPPORTED_FORMAT',
    'Content extraction supports PDF, PNG and JPEG files.',
    'Export the relevant content as PDF, PNG or JPEG.',
  );
}
