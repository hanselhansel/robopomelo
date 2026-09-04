import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';
import type { Document, Node } from 'yaml';
import { ProjectFsError } from '../errors.js';
import { DOMAIN_RECORD_LIMIT, PROTOTYPE_KEYS, SOURCE_BYTE_LIMIT, YAML_DEPTH_LIMIT } from '../limits.js';

export type JsonValue = null | string | boolean | number | JsonValue[] | {[key:string]: JsonValue};
export interface SourceDocument { document: Document; value: {[key:string]: JsonValue} }

export function parseSource(input: string | Uint8Array): SourceDocument {
  if ((typeof input === 'string' ? Buffer.byteLength(input) : input.byteLength) > SOURCE_BYTE_LIMIT) {
    throw new ProjectFsError('LIMIT_EXCEEDED', 'Source exceeds the 8 MiB byte limit.');
  }
  let text: string;
  try { text = typeof input === 'string' ? input : new TextDecoder('utf-8', {fatal:true}).decode(input); }
  catch { throw new ProjectFsError('YAML_INVALID', 'Source is not valid UTF-8.'); }
  const lineCounter = new LineCounter();
  const document = parseDocument(text, {version:'1.2', schema:'core', strict:true, uniqueKeys:true, keepSourceTokens:true, lineCounter});
  const error = document.errors[0] ?? document.warnings[0];
  if (error) {
    const position = lineCounter.linePos(error.pos[0]);
    throw new ProjectFsError('YAML_INVALID', error.message, position.line, position.col);
  }
  let records = 0;
  const reject = (node: Node, message: string): never => {
    const position = lineCounter.linePos(node.range?.[0] ?? 0);
    throw new ProjectFsError('YAML_INVALID', message, position.line, position.col);
  };
  const walk = (node: unknown, depth: number): void => {
    if (!node) return;
    if (isAlias(node)) reject(node, 'Aliases are not permitted.');
    if (!isMap(node) && !isSeq(node) && !isScalar(node)) throw new ProjectFsError('YAML_INVALID', 'Unsupported YAML node.');
    if (node.anchor || node.tag) reject(node, 'Anchors and explicit tags are not permitted.');
    if (isScalar(node)) {
      if (typeof node.value === 'number' && (!Number.isFinite(node.value) || (Number.isInteger(node.value) && !Number.isSafeInteger(node.value)))) {
        reject(node, 'Numbers must be finite and exactly representable; use strings for exact decimals.');
      }
      return;
    }
    if (depth >= YAML_DEPTH_LIMIT) throw new ProjectFsError('LIMIT_EXCEEDED', 'YAML nesting exceeds 64 containers.');
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string') reject(node, 'Mapping keys must be strings.');
        const key = (pair.key as {value:string}).value;
        if (key === '<<' || PROTOTYPE_KEYS.has(key)) reject(node, 'Merge and prototype keys are not permitted.');
        if (key === 'id' && ++records > DOMAIN_RECORD_LIMIT) throw new ProjectFsError('LIMIT_EXCEEDED', 'Source exceeds 10,000 records.');
        walk(pair.key, depth + 1);
        walk(pair.value, depth + 1);
      }
    } else for (const item of node.items) walk(item, depth + 1);
  };
  walk(document.contents, 0);
  if (!isMap(document.contents)) throw new ProjectFsError('YAML_INVALID', 'Source root must be a mapping.');
  return {document, value:document.toJS({maxAliasCount:0}) as SourceDocument['value']};
}
