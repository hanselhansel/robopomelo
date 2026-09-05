import {
  fields,
  type Collection,
  type Deployment,
  type Json,
  type PatchContext,
  type PatchEnvelope,
  type PatchEvaluation,
  type RecordBase,
} from '@robopomelo/spec';
import { DomainError } from './errors.js';
import { checkDeclaredCapability } from './mutation-capability.js';
import { assertMutationBase, finishMutation } from './mutation-common.js';
import { checkRecordPermissions, requireScope } from './permissions.js';
const allowlist = new Map<Collection | 'project', Set<string>>();
for (const field of fields) {
  const set = allowlist.get(field.collection) ?? new Set<string>();
  set.add(field.path);
  allowlist.set(field.collection, set);
}
for (const [collection, set] of allowlist) if (collection !== 'project') set.add('extensions');
// Structured advanced editors are not scalar fields in the presentation registry.
for (const [collection, advanced] of [
  ['evidence', ['location']],
  ['decisions', ['actor', 'decidedAt']],
  ['challengeAnswers', ['promptId', 'promptVersion']],
] as const)
  for (const key of advanced) allowlist.get(collection)!.add(key);
function assignAllowed(
  target: Record<string, unknown>,
  collection: Collection | 'project',
  values: Record<string, Json>,
): void {
  const allowed = allowlist.get(collection);
  for (const key of Object.keys(values))
    if (!allowed?.has(key) || ['__proto__', 'prototype', 'constructor', 'id'].includes(key))
      throw new DomainError('FIELD_NOT_ALLOWED', `Field is not authorable: ${collection}.${key}`);
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(target, key, {
      value: structuredClone(value),
      writable: true,
      enumerable: true,
      configurable: true,
    });
}
export function evaluatePatch(d: Deployment, patch: PatchEnvelope, c: PatchContext): PatchEvaluation {
  assertMutationBase(d, patch, c, 'patch');
  requireScope(c, 'author');
  checkDeclaredCapability(patch, d.specVersion);
  const candidate = structuredClone(d);
  for (const op of patch.operations) {
    if (op.op === 'project') {
      assignAllowed(candidate.project as unknown as Record<string, unknown>, 'project', op.fields);
      continue;
    }
    const collection = op.collection;
    if (!allowlist.has(collection))
      throw new DomainError('COLLECTION_NOT_ALLOWED', 'Collection is not authorable.');
    const rows = candidate[collection] as RecordBase[];
    if (op.op === 'add') {
      const record = structuredClone(op.record) as unknown as RecordBase;
      if (rows.some((r) => r.id === record.id))
        throw new DomainError('DUPLICATE_ID', 'Record ID already exists.');
      checkRecordPermissions(collection, undefined, record, c, patch.actor);
      rows.push(record);
    } else {
      const index = rows.findIndex((r) => r.id === op.id);
      if (index < 0) throw new DomainError('RECORD_NOT_FOUND', `Record does not exist: ${op.id}`);
      const old = structuredClone(rows[index]!);
      if (op.op === 'remove') {
        checkRecordPermissions(collection, old, undefined, c, patch.actor);
        rows.splice(index, 1);
      } else {
        assignAllowed(rows[index]! as unknown as Record<string, unknown>, collection, op.fields);
        checkRecordPermissions(collection, old, rows[index], c, patch.actor);
      }
    }
  }
  return finishMutation(d, candidate, c);
}
