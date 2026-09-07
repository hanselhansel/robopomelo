import type { AssetRef, Instance, SpatialAction } from '@robopomelo/spec';
import { SpatialError, assertLibraryRecord, type LibraryRecord, type NumberParameter } from '@robopomelo/spatial';
import { ProjectFsError } from '../errors.js';
import type { SafeRoot } from '../fs/safe-fs.js';
import { directory, jsonRead, jsonWrite, listOrEmpty, missing } from '../transactions/io.js';
/** Project-local library of promoted reusable versions under
 * assets/library/<id>/<version>/record.json. Records are immutable and
 * content-addressed; instances stay pinned to the version they reference and
 * an upgrade is a new source revision built from the returned actions. */
const ID = /^[a-z][a-z0-9-]{0,63}$/, SEMVER = /^\d+\.\d+\.\d+$/, HASH = /^[a-f0-9]{64}$/;
export const libraryRecordPath = (id: string, version: string): string => `assets/library/${id}/${version}/record.json`;
export type ParameterChange =
  | { name: string; change: 'added'; to: { minimum: number; maximum: number } }
  | { name: string; change: 'removed'; from: { minimum: number; maximum: number } }
  | { name: string; change: 'bounds-changed'; from: { minimum: number; maximum: number }; to: { minimum: number; maximum: number } };
export type UpgradePreview = {
  from: AssetRef; to: AssetRef; direction: 'upgrade' | 'downgrade'; flagged: boolean;
  parameterChanges: ParameterChange[]; affectedInstanceIds: string[]; resizedInstanceIds: string[]; actions: SpatialAction[];
};
export type PlacedInstance = { sceneId: string; instance: Instance };
const fail = (code: string, message: string): never => { throw new ProjectFsError(code, message); };
const bounds = (p: NumberParameter) => ({ minimum: p.minimum, maximum: p.maximum });
function parametersOf(record: LibraryRecord): Record<string, NumberParameter> {
  const content = record.content as { parameterSchema?: { properties?: Record<string, NumberParameter> } } | null;
  return (record.kind === 'assembly' || record.kind === 'object') && content?.parameterSchema?.properties ? content.parameterSchema.properties : {};
}
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i]! !== pb[i]!) return pa[i]! < pb[i]! ? -1 : 1;
  return 0;
}
function assertRef(ref: unknown, what: string): AssetRef {
  const r = ref as Partial<AssetRef> | null;
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !ID.test(r.id) || typeof r.version !== 'string' || !SEMVER.test(r.version)) return fail('ASSET_RECORD_INVALID', `${what} needs a slug id and semantic version.`);
  if (typeof r.sha256 !== 'string' || !HASH.test(r.sha256)) fail('ASSET_HASH_MISSING', `${what} ${r.id}@${r.version} has no content hash.`);
  return { id: r.id, version: r.version, sha256: r.sha256 as string };
}
function checked(value: unknown): LibraryRecord {
  try { return assertLibraryRecord(value); }
  catch (error) { if (error instanceof SpatialError) fail(error.code, error.message); throw error; }
}
export class AssetLibrary {
  constructor(private readonly root: SafeRoot) {}
  /** Idempotent for identical content; a different record at the same version is a conflict. */
  async promote(record: LibraryRecord): Promise<AssetRef> {
    const valid = checked(record);
    for (const path of ['assets', 'assets/library', `assets/library/${valid.ref.id}`, `assets/library/${valid.ref.id}/${valid.ref.version}`]) await directory(this.root, path);
    try {
      await jsonWrite(this.root, libraryRecordPath(valid.ref.id, valid.ref.version), valid);
    } catch (error) {
      if (error instanceof ProjectFsError && error.code === 'HISTORY_TAMPERED') fail('ASSET_CONFLICT', `${valid.ref.id}@${valid.ref.version} already exists with different bytes; promote a new version.`);
      throw error;
    }
    return { ...valid.ref };
  }
  async read(id: string, version: string): Promise<LibraryRecord> {
    if (typeof id !== 'string' || !ID.test(id) || typeof version !== 'string' || !SEMVER.test(version)) fail('ASSET_RECORD_INVALID', 'A library reference needs a slug id and semantic version.');
    let raw: unknown;
    try { raw = await jsonRead(this.root, libraryRecordPath(id, version)); }
    catch (error) { if (missing(error)) fail('ASSET_NOT_FOUND', `No library record ${id}@${version}.`); throw error; }
    const record = checked(raw);
    if (record.ref.id !== id || record.ref.version !== version) fail('ASSET_RECORD_INVALID', `Record at ${id}@${version} names ${record.ref.id}@${record.ref.version}.`);
    return record;
  }
  /** Damaged records are reported, never skipped silently. */
  async list(): Promise<{ records: LibraryRecord[]; damaged: { id: string; version: string; code: string }[] }> {
    const records: LibraryRecord[] = [], damaged: { id: string; version: string; code: string }[] = [];
    for (const id of (await listOrEmpty(this.root, 'assets/library')).filter((name) => ID.test(name)).sort()) {
      for (const version of (await listOrEmpty(this.root, `assets/library/${id}`)).filter((name) => SEMVER.test(name)).sort(compareSemver)) {
        try { records.push(await this.read(id, version)); }
        catch (error) {
          const code = error instanceof ProjectFsError ? error.code : 'STORAGE_INVALID';
          if (code === 'ASSET_NOT_FOUND') continue;
          damaged.push({ id, version, code });
        }
      }
    }
    return { records, damaged };
  }
  /** Reads both versions and describes the change without writing anything.
   * Applying the returned actions is the caller's new source revision. */
  async previewUpgrade(fromRef: AssetRef, toRef: AssetRef, instances: readonly PlacedInstance[]): Promise<UpgradePreview> {
    const from = assertRef(fromRef, 'Upgrade source'), to = assertRef(toRef, 'Upgrade target');
    if (from.id !== to.id) fail('ASSET_MISMATCH', `Cannot move instances from ${from.id} to ${to.id}; upgrades stay within one library id.`);
    if (from.version === to.version) fail('ASSET_SAME_VERSION', `${from.id} is already at ${from.version}.`);
    const [source, target] = await Promise.all([this.read(from.id, from.version), this.read(to.id, to.version)]);
    if (source.ref.sha256 !== from.sha256) fail('ASSET_HASH_MISMATCH', `${from.id}@${from.version} content hash does not match the stored record.`);
    if (target.ref.sha256 !== to.sha256) fail('ASSET_HASH_MISMATCH', `${to.id}@${to.version} content hash does not match the stored record.`);
    const before = parametersOf(source), after = parametersOf(target), parameterChanges: ParameterChange[] = [];
    for (const name of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      const a = before[name], b = after[name];
      if (a && !b) parameterChanges.push({ name, change: 'removed', from: bounds(a) });
      else if (!a && b) parameterChanges.push({ name, change: 'added', to: bounds(b) });
      else if (a && b && (a.minimum !== b.minimum || a.maximum !== b.maximum)) parameterChanges.push({ name, change: 'bounds-changed', from: bounds(a), to: bounds(b) });
    }
    const direction = compareSemver(to.version, from.version) > 0 ? 'upgrade' : 'downgrade';
    const affected = instances.filter(({ instance }) => instance.asset.id === from.id && instance.asset.version === from.version && instance.asset.sha256 === from.sha256);
    const actions: SpatialAction[] = [{ kind: 'register-asset', asset: { ...target.ref } }], resized: string[] = [];
    for (const { sceneId, instance } of affected) {
      const replacementId = `${instance.id}-${to.version.replace(/\./g, '-')}`;
      let dimensions = instance.dimensions;
      if (dimensions.state === 'known' || dimensions.state === 'unverified') {
        const value = { ...dimensions.value };
        let changed = false;
        for (const key of ['lengthM', 'widthM', 'heightM'] as const) {
          const spec = after[key];
          if (!spec) continue;
          const clamped = Math.min(spec.maximum, Math.max(spec.minimum, value[key]));
          if (clamped !== value[key]) { value[key] = clamped; changed = true; }
        }
        if (changed) { dimensions = { state: 'unverified', value, sourceIds: [...dimensions.sourceIds] }; resized.push(instance.id); }
      }
      actions.push({ kind: 'remove', sceneId, id: instance.id, replacementId });
      actions.push({ kind: 'place', sceneId, instance: { id: replacementId, asset: { ...target.ref }, pose: { ...instance.pose }, dimensions, sourceIds: [...instance.sourceIds] } });
    }
    return { from, to, direction, flagged: direction === 'downgrade', parameterChanges, affectedInstanceIds: affected.map((a) => a.instance.id), resizedInstanceIds: resized, actions };
  }
}
