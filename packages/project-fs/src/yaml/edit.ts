import { isMap, isScalar, isSeq, visit } from 'yaml';
import type { Node, YAMLMap, YAMLSeq } from 'yaml';
import { ProjectFsError } from '../errors.js';
import { PROTOTYPE_KEYS, YAML_DEPTH_LIMIT } from '../limits.js';
import { parseSource } from './parse.js';
import type { JsonValue, SourceDocument } from './parse.js';

export interface RecordTarget {collection: string; id: string}
export interface RecordEdit extends RecordTarget {field: string; value: JsonValue}

function assertJson(value:unknown, ancestors = new Set<object>(), depth = 0):void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return;
  if (typeof value !== 'object' || !value || depth >= YAML_DEPTH_LIMIT || ancestors.has(value)) throw new ProjectFsError('INVALID_EDIT','Edit values must be bounded, acyclic JSON.');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new ProjectFsError('INVALID_EDIT','Edit values must contain plain JSON objects.');
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || PROTOTYPE_KEYS.has(key) || key === '<<') throw new ProjectFsError('INVALID_EDIT','Unsafe edit key.');
    if (Array.isArray(value) && key === 'length') continue;
    const property = Object.getOwnPropertyDescriptor(value,key)!;
    if (!('value' in property)) throw new ProjectFsError('INVALID_EDIT','JSON cannot contain accessors.');
    assertJson(property.value,ancestors,depth + 1);
  }
  ancestors.delete(value);
}

function target(source: SourceDocument, edit: RecordTarget): {source: SourceDocument; records: YAMLSeq; record: YAMLMap; index:number} {
  if (PROTOTYPE_KEYS.has(edit.collection)) throw new ProjectFsError('INVALID_EDIT', 'Unsafe collection.');
  const next = {document:source.document.clone(), value:source.value};
  const records = next.document.get(edit.collection, true);
  if (!isSeq(records)) throw new ProjectFsError('INVALID_EDIT', 'Collection is not a record sequence.');
  const matches = records.items.map((node,index) => ({node,index})).filter(({node}) => isMap(node) && node.get('id') === edit.id);
  if (matches.length !== 1) throw new ProjectFsError('INVALID_EDIT', 'Stable ID must identify exactly one record.');
  return {source:next, records, record:matches[0]!.node as YAMLMap, index:matches[0]!.index};
}

function comments(node: unknown): string[] {
  const result: string[] = [];
  visit(node as Node, {Node(_key, item) {
    if (item.commentBefore) result.push(item.commentBefore);
    if (item.comment) result.push(item.comment);
  }});
  return result;
}

function checked(source: SourceDocument): SourceDocument {
  // Reparse generated edits before exposing their semantics to a transaction.
  const reparsed = parseSource(source.document.toString({lineWidth:0}));
  return {document:source.document, value:reparsed.value};
}

export function editRecord(source: SourceDocument, edit: RecordEdit): SourceDocument {
  assertJson(edit.value);
  if (edit.field === 'id' || edit.field === '<<' || PROTOTYPE_KEYS.has(edit.field)) throw new ProjectFsError('INVALID_EDIT', 'Unsafe or immutable field.');
  const selected = target(source, edit);
  const prior = selected.record.get(edit.field, true);
  const next = selected.source.document.createNode(edit.value);
  if (isScalar(prior) && isScalar(next)) { prior.value = next.value; }
  else {
    const notes = comments(prior);
    if (notes.length) next.commentBefore = notes.join('\n');
    selected.record.set(edit.field, next);
  }
  return checked(selected.source);
}

export function removeRecord(source: SourceDocument, edit: RecordTarget): SourceDocument {
  const selected = target(source, edit);
  const notes = comments(selected.record);
  const adjacent = selected.records.items[selected.index + 1] ?? selected.records.items[selected.index - 1];
  if (notes.length) {
    if (!isMap(adjacent)) throw new ProjectFsError('PRESERVATION_CONFLICT', 'Record comments have no surviving adjacent record.');
    adjacent.commentBefore = [...notes, adjacent.commentBefore].filter(Boolean).join('\n');
  }
  selected.records.delete(selected.index);
  return checked(selected.source);
}
