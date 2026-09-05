import { checkSchema } from '@robopomelo/spec';
import type { Actor, FieldDiff, Mutation } from '@robopomelo/spec';
import { checkInputLimits } from '../../../spec/src/input-limits.js';
import { ProjectFsError } from '../errors.js';
import type { CommitInput, SourceIdentity } from '../contracts.js';

export const isHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9.:_-]{0,127}$/.test(value);
const text = (value: unknown, maximum = 16_384): value is string =>
  typeof value === 'string' && value.length <= maximum && value.trim().length > 0;
export const validTimestamp = (value: unknown): value is string =>
  text(value, 128) && value.includes('T') && Number.isFinite(Date.parse(value));
export function closed(
  value: unknown,
  required: string[],
  optional: string[] = [],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
  );
}
/** Bounded JSON-only traversal runs before recursive canonicalization or schema work. */
export function assertMetadata(value: unknown): void {
  if (checkInputLimits(value))
    throw new ProjectFsError(
      'STORAGE_INVALID',
      'Project metadata exceeds input depth, record or node limits.',
    );
  const pending: unknown[] = [value];
  while (pending.length) {
    const item = pending.pop();
    if (item === null || typeof item === 'string' || typeof item === 'boolean') continue;
    if (typeof item === 'number' && Number.isFinite(item)) continue;
    if (!item || typeof item !== 'object')
      throw new ProjectFsError('STORAGE_INVALID', 'Project metadata must contain only JSON values.');
    for (const key of Object.keys(item)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        throw new ProjectFsError('STORAGE_INVALID', 'Project metadata contains an unsafe key.');
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!('value' in descriptor))
        throw new ProjectFsError('STORAGE_INVALID', 'Project metadata cannot contain accessors.');
      pending.push(descriptor.value);
    }
  }
}
export function validActor(value: unknown): value is Actor {
  return (
    closed(value, ['kind', 'name'], ['source', 'onBehalfOf']) &&
    ['human', 'agent', 'external'].includes(value.kind as string) &&
    text(value.name) &&
    (value.source === undefined || text(value.source)) &&
    (value.onBehalfOf === undefined || text(value.onBehalfOf))
  );
}
export function validIdentity(value: unknown): value is SourceIdentity {
  return (
    closed(value, ['sourceRevision', 'sourceHash']) && isId(value.sourceRevision) && isHash(value.sourceHash)
  );
}
const collections = new Set([
  'root',
  'project',
  'review',
  'stakeholders',
  'needs',
  'problems',
  'workflows',
  'challenges',
  'risks',
  'assumptions',
  'kpis',
  'requirements',
  'acceptanceTests',
  'evidence',
  'decisions',
  'challengeAnswers',
]);
export function validDiff(value: unknown): value is FieldDiff[] {
  return (
    Array.isArray(value) &&
    value.length <= 100_000 &&
    value.every(
      (item) =>
        closed(item, ['collection', 'id', 'field', 'before', 'after']) &&
        collections.has(item.collection as string) &&
        isId(item.id) &&
        typeof item.field === 'string' &&
        /^[A-Za-z$][A-Za-z0-9_-]{0,127}$/.test(item.field),
    )
  );
}
export function validMutation(value: unknown): value is Mutation {
  if (!value || typeof value !== 'object' || !('kind' in value)) return false;
  const record = value as Record<string, unknown>;
  if (record.kind === 'patch')
    return closed(record, ['kind', 'patch']) && checkSchema(record.patch, 'patch').length === 0;
  return (
    record.kind === 'review' &&
    closed(record, ['kind', 'review']) &&
    checkSchema(record.review, 'review').length === 0
  );
}
export function validOperation(value: unknown): value is NonNullable<CommitInput['operation']> {
  return (
    (closed(value, ['kind', 'revision']) && value.kind === 'restore' && isId(value.revision)) ||
    (closed(value, ['kind', 'sourceHash']) && value.kind === 'reconcile' && isHash(value.sourceHash))
  );
}
