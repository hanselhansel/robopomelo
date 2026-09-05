import { isMap, isScalar, isSeq, visit } from 'yaml';
import type { Document, Node } from 'yaml';
import { isDeepStrictEqual } from 'node:util';
import type { Deployment } from '@robopomelo/spec';
import type { SourceDocument } from '../yaml/parse.js';
import { serializeSource } from '../yaml/serialize.js';
import { ProjectFsError } from '../errors.js';

function notes(node: unknown): string[] {
  const result: string[] = [];
  visit(node as Node, {
    Node(_key, value) {
      if (value.commentBefore) result.push(value.commentBefore);
      if (value.comment) result.push(value.comment);
    },
  });
  return result;
}
function preserve(node: Node, removed: unknown): void {
  const comments = notes(removed);
  if (comments.length) node.commentBefore = [...comments, node.commentBefore].filter(Boolean).join('\n');
}
function reconcile(document: Document, node: unknown, value: unknown): Node {
  if (isScalar(node) && (value === null || ['string', 'number', 'boolean'].includes(typeof value))) {
    node.value = value;
    return node;
  }
  if (isMap(node) && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const next = value as Record<string, unknown>;
    for (const pair of [...node.items]) {
      const key = isScalar(pair.key) ? String(pair.key.value) : '';
      if (!Object.hasOwn(next, key)) {
        preserve(node, pair.key);
        preserve(node, pair.value);
        node.delete(key);
      }
    }
    for (const [key, item] of Object.entries(next))
      node.set(key, reconcile(document, node.get(key, true), item));
    return node;
  }
  if (isSeq(node) && Array.isArray(value)) {
    const before = [...node.items];
    const used = new Set<unknown>();
    const next = value.map((item, index) => {
      const id = item && typeof item === 'object' && 'id' in item ? item.id : undefined;
      const found =
        id !== undefined ? before.find((entry) => isMap(entry) && entry.get('id') === id) : before[index];
      used.add(found);
      return reconcile(document, found, item);
    });
    for (const item of before)
      if (!used.has(item) && notes(item).length) {
        if (!next.length)
          throw new ProjectFsError(
            'PRESERVATION_CONFLICT',
            'Removed records contain comments with no surviving adjacent record.',
          );
        preserve(next[0]!, item);
      }
    node.items = next;
    return node;
  }
  const replacement = document.createNode(value);
  preserve(replacement, node);
  return replacement;
}
export function serializeCandidate(
  source: SourceDocument,
  candidate: Deployment | SourceDocument['value'],
): string {
  const document = source.document.clone();
  if (!isDeepStrictEqual(source.value, candidate))
    document.contents = reconcile(document, document.contents, candidate);
  return serializeSource({ document, value: source.value }, candidate as unknown as SourceDocument['value']);
}
