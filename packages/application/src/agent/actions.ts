import type { Collection, Json, PatchOperation } from '@robopomelo/spec';
/** Collections a discovery model may draft into. Decisions, evidence and
 * review state stay human-only; approval never comes from a proposal. */
const draftable: ReadonlySet<Collection> = new Set<Collection>([
  'stakeholders', 'needs', 'problems', 'workflows', 'challenges', 'risks', 'assumptions', 'kpis', 'requirements', 'acceptanceTests', 'challengeAnswers',
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9.:_-]{0,127}$/;
const ACTION_LIMIT = 20;
const BYTE_LIMIT = 64 * 1024;
export class ActionDecodeError extends Error {
  readonly code = 'PROVIDER_SCHEMA';
  constructor(message: string) {
    super(message);
    this.name = 'ActionDecodeError';
  }
}
const isJson = (value: unknown, depth = 0): value is Json => {
  if (depth > 12) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJson(item, depth + 1));
  if (typeof value === 'object') return Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every((item) => isJson(item, depth + 1));
  return false;
};
const record = (value: unknown, what: string): Record<string, Json> => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isJson(value)) throw new ActionDecodeError(`${what} must be a JSON object.`);
  if (Object.keys(value).some((key) => key === '__proto__' || key === 'constructor' || key === 'prototype')) throw new ActionDecodeError(`${what} has a reserved key.`);
  return value as Record<string, Json>;
};
const collection = (value: unknown): Collection => {
  if (typeof value !== 'string' || !draftable.has(value as Collection)) throw new ActionDecodeError('Proposed action targets a collection the agent may not draft.');
  return value as Collection;
};
/** Closed structural decode of untrusted provider actions into PatchOperations.
 * Semantic validation (schema, references, rules) happens in the core evaluator. */
export function decodeProposedActions(value: unknown): PatchOperation[] {
  if (!Array.isArray(value)) throw new ActionDecodeError('Proposed actions must be an array.');
  if (value.length > ACTION_LIMIT) throw new ActionDecodeError(`At most ${ACTION_LIMIT} proposed actions are accepted per turn.`);
  if (JSON.stringify(value).length > BYTE_LIMIT) throw new ActionDecodeError('Proposed actions exceed the accepted size.');
  return value.map((item): PatchOperation => {
    const action = record(item, 'Proposed action');
    const keys = Object.keys(action).sort().join(',');
    switch (action.op) {
      case 'project':
        if (keys !== 'fields,op') throw new ActionDecodeError('Project action shape.');
        return { op: 'project', fields: record(action.fields, 'Project fields') };
      case 'add':
        if (keys !== 'collection,op,record') throw new ActionDecodeError('Add action shape.');
        return { op: 'add', collection: collection(action.collection), record: record(action.record, 'Record') };
      case 'update':
        if (keys !== 'collection,fields,id,op' || typeof action.id !== 'string' || !ID.test(action.id)) throw new ActionDecodeError('Update action shape.');
        return { op: 'update', collection: collection(action.collection), id: action.id, fields: record(action.fields, 'Fields') };
      default:
        throw new ActionDecodeError('Unsupported proposed action.');
    }
  });
}
