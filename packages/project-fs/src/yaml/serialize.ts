import { isDeepStrictEqual } from 'node:util';
import { ProjectFsError } from '../errors.js';
import { parseSource } from './parse.js';
import type { JsonValue, SourceDocument } from './parse.js';

export function serializeSource(source: SourceDocument, expectedValue: JsonValue = source.value): string {
  const text = source.document.toString({lineWidth:0});
  const actual = parseSource(text).value;
  if (!isDeepStrictEqual(actual, expectedValue)) throw new ProjectFsError('SEMANTIC_MISMATCH', 'Serialized source differs from the approved semantic result.');
  return text;
}
