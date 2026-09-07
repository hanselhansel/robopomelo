import { SPATIAL_NAMESPACE, type Deployment, type FieldDiff, type Json, type SpatialExtension } from '@robopomelo/spec';
import { same } from './permissions.js';
type Row = Record<string, unknown> & { id: string };
const collections = ['assets', 'robotProfiles', 'scenes', 'scenarios', 'bindings'] as const;
const read = (d: Deployment): SpatialExtension | undefined => d.extensions[SPATIAL_NAMESPACE] as unknown as SpatialExtension | undefined;
function objects(ext: SpatialExtension | undefined): Map<string, { collection: string; row: Row }> {
  const map = new Map<string, { collection: string; row: Row }>();
  if (!ext) return map;
  for (const collection of collections)
    for (const raw of (ext[collection] as unknown as Row[]) ?? []) {
      const key = collection === 'assets' ? `${raw.id}:${String(raw.version)}` : raw.id;
      if (collection === 'scenes') {
        const { instances, ...header } = raw as Row & { instances?: Row[] };
        map.set(`spatial.scene:${key}`, { collection: 'spatial.scenes', row: header as Row });
        for (const instance of instances ?? []) map.set(`spatial.instance:${instance.id}`, { collection: 'spatial.instances', row: { ...instance, sceneId: raw.id } as Row });
      } else map.set(`spatial.${collection}:${key}`, { collection: `spatial.${collection}`, row: raw });
    }
  return map;
}
/** Object-level rows for the spatial extension so review shows which scene
 * object, scenario or binding changed rather than one opaque extension blob. */
export function spatialDiff(before: Deployment, after: Deployment): FieldDiff[] {
  const diff: FieldDiff[] = [];
  const old = objects(read(before)), next = objects(read(after));
  for (const key of [...new Set([...old.keys(), ...next.keys()])].sort()) {
    const a = old.get(key), b = next.get(key);
    const id = key.slice(key.indexOf(':') + 1);
    if (!a || !b) {
      diff.push({ collection: (a ?? b)!.collection, id, field: '$record', before: (a?.row ?? null) as unknown as Json, after: (b?.row ?? null) as unknown as Json });
      continue;
    }
    for (const field of [...new Set([...Object.keys(a.row), ...Object.keys(b.row)])].sort())
      if (field !== 'id' && !same(a.row[field], b.row[field]))
        diff.push({ collection: a.collection, id, field, before: (a.row[field] ?? null) as Json, after: (b.row[field] ?? null) as Json });
  }
  return diff;
}
/** Extensions without the spatial namespace, for the coarse root comparison. */
export function extensionsWithoutSpatial(d: Deployment): Record<string, Json> {
  const { [SPATIAL_NAMESPACE]: _spatial, ...rest } = d.extensions as Record<string, Json>;
  return rest;
}
