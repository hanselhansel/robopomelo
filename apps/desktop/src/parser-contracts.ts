import { preflightAttachment } from '@robopomelo/ingestion';
export type ParserWarning =
  'SCANNED_PDF' | 'PASSWORD_REQUIRED' | 'EXCERPT_TRUNCATED' | 'PREVIEW_LIMIT' | 'PAGE_LIMIT' | 'PARSE_FAILED';
export interface ParserRequest {
  jobId: string;
  generation: number;
  format: 'pdf' | 'png' | 'jpeg';
  bytes: Uint8Array;
}
export interface ParserResponse {
  jobId: string;
  generation: number;
  state: 'parsed' | 'partial' | 'unsupported' | 'failed';
  textExcerpt: string;
  pageCount: number;
  pageImages: Uint8Array[];
  warnings: ParserWarning[];
}
const warnings: readonly string[] = [
  'SCANNED_PDF',
  'PASSWORD_REQUIRED',
  'EXCERPT_TRUNCATED',
  'PREVIEW_LIMIT',
  'PAGE_LIMIT',
  'PARSE_FAILED',
];
function invalid(): never {
  throw new Error('PARSER_PROTOCOL_INVALID');
}
function record(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== fields.sort().join(','))
    invalid();
  return value as Record<string, unknown>;
}
function identity(value: Record<string, unknown>) {
  if (
    typeof value.jobId !== 'string' ||
    !/^[a-zA-Z0-9-]{1,128}$/.test(value.jobId) ||
    !Number.isSafeInteger(value.generation) ||
    (value.generation as number) < 0
  )
    invalid();
  return { jobId: value.jobId, generation: value.generation as number };
}
export function checkedParserRequest(input: unknown): ParserRequest {
  const value = record(input, ['jobId', 'generation', 'format', 'bytes']);
  const id = identity(value);
  if (!(value.bytes instanceof Uint8Array)) invalid();
  const preflight = preflightAttachment({ displayName: 'Attachment', bytes: value.bytes });
  if (preflight.format !== value.format) invalid();
  return { ...id, format: preflight.format, bytes: value.bytes };
}
export function checkedParserResponse(
  input: unknown,
  expected: Pick<ParserRequest, 'jobId' | 'generation'>,
): ParserResponse {
  const value = record(input, [
    'jobId',
    'generation',
    'state',
    'textExcerpt',
    'pageCount',
    'pageImages',
    'warnings',
  ]);
  const id = identity(value);
  if (id.jobId !== expected.jobId || id.generation !== expected.generation) invalid();
  if (!['parsed', 'partial', 'unsupported', 'failed'].includes(String(value.state))) invalid();
  if (typeof value.textExcerpt !== 'string' || value.textExcerpt.length > 100000) invalid();
  if (
    !Number.isSafeInteger(value.pageCount) ||
    (value.pageCount as number) < 0 ||
    (value.pageCount as number) > 100
  )
    invalid();
  if (
    !Array.isArray(value.warnings) ||
    value.warnings.length > 6 ||
    value.warnings.some((w) => typeof w !== 'string' || !warnings.includes(w))
  )
    invalid();
  if (!Array.isArray(value.pageImages) || value.pageImages.length > 3) invalid();
  const images = value.pageImages.map((bytes: unknown) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 2 * 1024 ** 2) invalid();
    const preview = preflightAttachment({ displayName: 'Preview', bytes });
    if (
      preview.format !== 'png' ||
      !preview.dimensions ||
      Math.max(preview.dimensions.width, preview.dimensions.height) > 1024
    )
      invalid();
    return bytes;
  });
  if (
    (value.state === 'failed' || value.state === 'unsupported') &&
    (images.length || value.textExcerpt.length || value.pageCount !== 0)
  )
    invalid();
  return {
    ...id,
    state: value.state as ParserResponse['state'],
    textExcerpt: value.textExcerpt,
    pageCount: value.pageCount as number,
    pageImages: images,
    warnings: value.warnings as ParserWarning[],
  };
}
