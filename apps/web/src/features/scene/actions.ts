import type { AssetRef, Extents, Instance, Pose, Scene, SpatialAction, SpatialEnvelope, SPATIAL_CAPABILITY } from '@robopomelo/spec';
import type { CatalogEntry } from '@robopomelo/spatial';
/** Builders that turn editor intents into checked spatial actions. Every
 * envelope names the base it was read against and carries a fresh mutation id. */
export type SourceBase = { sourceRevision: string; sourceHash: string };
/** Browser code takes only types from the spec root; the literal is checked against the spec constant. */
export const SPATIAL_CAPABILITY_ID: typeof SPATIAL_CAPABILITY = 'spatial-planning-v1';
export type CatalogEntryView = Pick<CatalogEntry, 'id' | 'version' | 'kind' | 'title' | 'description' | 'parameterSchema' | 'display' | 'license' | 'sha256'> & { robot?: CatalogEntry['robot'] };
export function newMutationId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}
export const envelopeFor = (base: SourceBase, purpose: string, actions: SpatialAction[]): SpatialEnvelope => ({
  sourceRevision: base.sourceRevision, sourceHash: base.sourceHash, mutationId: newMutationId(), purpose, actions,
});
/** True when the envelope was built against a base that is no longer current. */
export const isStale = (envelope: SourceBase, current: SourceBase): boolean =>
  envelope.sourceRevision !== current.sourceRevision || envelope.sourceHash !== current.sourceHash;
export const assetRefFor = (entry: CatalogEntryView): AssetRef => ({ id: entry.id, version: entry.version, sha256: entry.sha256 });
export function defaultExtents(entry: CatalogEntryView): Extents {
  const p = entry.parameterSchema.properties;
  return { lengthM: p.lengthM?.default ?? 1, widthM: p.widthM?.default ?? 1, heightM: p.heightM?.default ?? 1 };
}
export function nextInstanceId(entryId: string, existing: ReadonlySet<string>): string {
  let n = 1;
  while (existing.has(`${entryId}-${n}`)) n++;
  return `${entryId}-${n}`;
}
/** Places a catalog entry with its parameter defaults. Defaults are assumptions,
 * so the dimensions are unverified and cite no source. */
export const placeAction = (sceneId: string, entry: CatalogEntryView, id: string, pose: Pose): SpatialAction => ({
  kind: 'place', sceneId,
  instance: { id, asset: assetRefFor(entry), pose, dimensions: { state: 'unverified', value: defaultExtents(entry), sourceIds: [] }, sourceIds: [] },
});
export const moveAction = (sceneId: string, id: string, pose: Pose): SpatialAction => ({ kind: 'move', sceneId, id, pose });
export const resizeAction = (sceneId: string, id: string, dimensions: Instance['dimensions']): SpatialAction => ({ kind: 'resize', sceneId, id, dimensions });
export const removeAction = (sceneId: string, id: string, replacementId: string | null = null): SpatialAction => ({ kind: 'remove', sceneId, id, replacementId });
export const registerAssetAction = (asset: AssetRef): SpatialAction => ({ kind: 'register-asset', asset });
/** First spatial write: activation, scene definition and asset registration in one atomic envelope. */
export function bootstrapActions(sceneId: string, name: string, assets: AssetRef[], floor: Scene['floor'] = { state: 'unknown', reason: 'Floor extents have not been supplied yet.' }): SpatialAction[] {
  return [{ kind: 'activate', capability: SPATIAL_CAPABILITY_ID }, { kind: 'define-scene', scene: { id: sceneId, name, floor } }, ...assets.map(registerAssetAction)];
}
export function describeAction(action: SpatialAction, name: (id: string) => string): string {
  const fmt = (v: number) => v.toFixed(2);
  switch (action.kind) {
    case 'move': return `Moved ${name(action.id)} to X ${fmt(action.pose.xM)} m, Y ${fmt(action.pose.yM)} m, rotation ${Math.round((action.pose.yawRad * 180) / Math.PI)} degrees.`;
    case 'resize': return action.dimensions.state === 'known' || action.dimensions.state === 'unverified'
      ? `Resized ${name(action.id)} to ${fmt(action.dimensions.value.lengthM)} by ${fmt(action.dimensions.value.widthM)} by ${fmt(action.dimensions.value.heightM)} m.`
      : `Cleared the dimensions of ${name(action.id)}.`;
    case 'place': return `Placed ${action.instance.id} at X ${fmt(action.instance.pose.xM)} m, Y ${fmt(action.instance.pose.yM)} m.`;
    case 'remove': return `Removed ${name(action.id)}.`;
    case 'define-scene': return `Created scene ${action.scene.name}.`;
    default: return 'Scene updated.';
  }
}
