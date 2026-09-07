import type { AssetRef } from '@robopomelo/spec';
import { validateRecipe } from './assembly.js';
import { validateBehavior, type BehaviorProfile } from './behavior.js';
import { entryHash, validateEntry, type Catalog, type CatalogEntry } from './catalog.js';
import { SpatialError, hashJson } from './hash.js';
import { validateTemplate } from './template.js';
/** Project-local authoring lifecycle: draft -> validated -> reusable-version.
 * Pure transitions; the caller supplies the clock. A failed validation keeps
 * the draft visibly incomplete with findings. Promotion produces an immutable,
 * content-addressed library record and never rewrites an existing version. */
export type DraftKind = 'object' | 'assembly' | 'behavior' | 'template';
export type DraftStatus = 'draft' | 'validated' | 'reusable-version';
export type Finding = { code: string; message: string };
export interface AssetDraft {
  id: string;
  kind: DraftKind;
  version: string | null;
  status: DraftStatus;
  content: unknown;
  validation: { ok: boolean; findings: Finding[] };
  promotedTo: AssetRef | null;
}
export interface LibraryRecord { formatVersion: '1.0.0'; ref: AssetRef; kind: DraftKind; content: unknown; createdAt: string }
export type ValidationContext = { catalog: Catalog; behaviors?: readonly BehaviorProfile[] };
export const SEMVER = /^\d+\.\d+\.\d+$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/, HASH = /^[a-f0-9]{64}$/;
const KINDS: readonly DraftKind[] = ['object', 'assembly', 'behavior', 'template'];
const fail = (code: string, message: string): never => { throw new SpatialError(code, message); };
export function newDraft(id: string, kind: DraftKind, content: unknown): AssetDraft {
  if (typeof id !== 'string' || !ID.test(id)) fail('DRAFT_INVALID', 'Draft id must be a lowercase slug.');
  if (!KINDS.includes(kind)) fail('DRAFT_INVALID', `Draft kind ${String(kind)} is not supported.`);
  return { id, kind, version: null, status: 'draft', content, validation: { ok: false, findings: [{ code: 'NOT_VALIDATED', message: 'This draft has not been validated yet.' }] }, promotedTo: null };
}
/** Returns the canonical validated content or throws a SpatialError. */
export function validateContent(kind: DraftKind, content: unknown, context: ValidationContext): unknown {
  switch (kind) {
    case 'assembly': return validateRecipe(content, context.catalog);
    case 'behavior': return validateBehavior(content);
    case 'template': return validateTemplate(content);
    case 'object': {
      if (!content || typeof content !== 'object') return fail('CATALOG_INVALID', 'An object draft needs a catalog entry body.');
      const body = content as Omit<CatalogEntry, 'sha256'> & { sha256?: string };
      const entry = validateEntry({ ...body, sha256: entryHash(body) });
      const { sha256: _ignored, ...unhashed } = entry;
      return unhashed;
    }
  }
}
/** Validation never throws: a failing draft stays a draft with visible findings. */
export function validateDraft(draft: AssetDraft, context: ValidationContext): AssetDraft {
  try {
    const content = validateContent(draft.kind, draft.content, context);
    return { ...draft, content, status: 'validated', validation: { ok: true, findings: [] } };
  } catch (error) {
    const finding: Finding = error instanceof SpatialError ? { code: error.code, message: error.message } : { code: 'VALIDATION_FAILED', message: error instanceof Error ? error.message : String(error) };
    return { ...draft, status: 'draft', validation: { ok: false, findings: [finding] }, promotedTo: null };
  }
}
export const libraryHash = (kind: DraftKind, content: unknown): string => hashJson({ kind, content });
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); }
  return value;
}
/** Structural and hash check for a stored record. */
export function assertLibraryRecord(value: unknown): LibraryRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('ASSET_RECORD_INVALID', 'A library record must be an object.');
  const r = value as Record<string, unknown>, ref = (r.ref ?? {}) as Record<string, unknown>;
  const keys = Object.keys(r).sort().join(',');
  if (keys !== 'content,createdAt,formatVersion,kind,ref' || r.formatVersion !== '1.0.0') fail('ASSET_RECORD_INVALID', 'Library record has unexpected fields.');
  if (!KINDS.includes(r.kind as DraftKind)) fail('ASSET_RECORD_INVALID', 'Library record kind is unsupported.');
  if (typeof ref.id !== 'string' || !ID.test(ref.id) || typeof ref.version !== 'string' || !SEMVER.test(ref.version)) fail('ASSET_RECORD_INVALID', 'Library record needs a slug id and semantic version.');
  const name = `${String(ref.id)}@${String(ref.version)}`;
  if (typeof ref.sha256 !== 'string' || !HASH.test(ref.sha256)) fail('ASSET_HASH_MISSING', `Library record ${name} has no content hash.`);
  if (typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt))) fail('ASSET_RECORD_INVALID', 'Library record createdAt must be a timestamp.');
  if (libraryHash(r.kind as DraftKind, r.content) !== ref.sha256) fail('ASSET_HASH_MISMATCH', `Library record ${name} does not match its content hash.`);
  return value as LibraryRecord;
}
export type PromoteOptions = { version: string; id?: string; clock: () => string; existing?: LibraryRecord | null };
/** Requires a validated draft. Re-promoting identical content at the same
 * version returns the existing record; different content needs a new version. */
export function promote(draft: AssetDraft, options: PromoteOptions): { draft: AssetDraft; record: LibraryRecord } {
  if (draft.status !== 'validated' || !draft.validation.ok) fail('DRAFT_NOT_VALIDATED', 'Only a validated draft can become a reusable version.');
  const id = options.id ?? draft.id;
  if (!ID.test(id)) fail('DRAFT_INVALID', 'Library id must be a lowercase slug.');
  if (typeof options.version !== 'string' || !SEMVER.test(options.version)) fail('VERSION_INVALID', 'A promoted version must be semantic (major.minor.patch).');
  const sha256 = libraryHash(draft.kind, draft.content);
  const existing = options.existing ?? null;
  if (existing) {
    if (existing.ref.id === id && existing.ref.version === options.version) {
      if (existing.ref.sha256 !== sha256 || existing.kind !== draft.kind) fail('VERSION_REQUIRED', `${id}@${options.version} already exists with different content; choose a new version.`);
      return { draft: { ...draft, status: 'reusable-version', version: options.version, promotedTo: { ...existing.ref } }, record: existing };
    }
  }
  const createdAt = options.clock();
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) fail('DRAFT_INVALID', 'Clock must return an ISO timestamp.');
  const record = deepFreeze({ formatVersion: '1.0.0' as const, ref: { id, version: options.version, sha256 }, kind: draft.kind, content: JSON.parse(JSON.stringify(draft.content)) as unknown, createdAt });
  return { draft: { ...draft, status: 'reusable-version', version: options.version, promotedTo: { ...record.ref } }, record };
}
