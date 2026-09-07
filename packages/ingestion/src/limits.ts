export const DEFAULT_INGESTION_LIMITS = Object.freeze({
  maxFiles: 20,
  maxFileBytes: 25 * 1024 ** 2,
  maxTotalBytes: 100 * 1024 ** 2,
  maxPdfPages: 100,
  maxImagePixels: 20_000_000,
});
export type IngestionErrorCode =
  | 'ATTACHMENT_TOO_MANY_FILES' | 'ATTACHMENT_INVALID_SIZE'
  | 'ATTACHMENT_FILE_TOO_LARGE' | 'ATTACHMENT_TOTAL_TOO_LARGE'
  | 'ATTACHMENT_UNSUPPORTED_FORMAT' | 'ATTACHMENT_MALFORMED_HEADER'
  | 'ATTACHMENT_IMAGE_TOO_LARGE' | 'ATTACHMENT_PDF_TOO_MANY_PAGES'
  | 'ATTACHMENT_INVALID_PAGE_COUNT';
export class IngestionError extends Error {
  constructor(readonly code: IngestionErrorCode, message: string, readonly action: string) {
    super(message); this.name = 'IngestionError';
  }
}
export function assertAttachmentBatch(files: readonly { byteLength: number }[]): void {
  if (files.length > DEFAULT_INGESTION_LIMITS.maxFiles) throw new IngestionError('ATTACHMENT_TOO_MANY_FILES', 'Select at most 20 files.', 'Remove files and try again.');
  let total = 0;
  for (const { byteLength } of files) {
    if (!Number.isSafeInteger(byteLength) || byteLength <= 0) throw new IngestionError('ATTACHMENT_INVALID_SIZE', 'The file has no valid content size.', 'Choose a nonempty file.');
    if (byteLength > DEFAULT_INGESTION_LIMITS.maxFileBytes) throw new IngestionError('ATTACHMENT_FILE_TOO_LARGE', 'A file exceeds 25 MiB.', 'Export a smaller file and select it again.');
    total += byteLength;
  }
  if (total > DEFAULT_INGESTION_LIMITS.maxTotalBytes) throw new IngestionError('ATTACHMENT_TOTAL_TOO_LARGE', 'The selected files exceed 100 MiB in total.', 'Remove files or export smaller versions.');
}
export function assertPdfPageCount(count: number): void {
  if (!Number.isSafeInteger(count) || count <= 0) throw new IngestionError('ATTACHMENT_INVALID_PAGE_COUNT', 'The PDF has no valid page count.', 'Export a valid PDF and select it again.');
  if (count > DEFAULT_INGESTION_LIMITS.maxPdfPages) throw new IngestionError('ATTACHMENT_PDF_TOO_MANY_PAGES', 'The PDF exceeds 100 pages.', 'Export only the relevant pages.');
}
