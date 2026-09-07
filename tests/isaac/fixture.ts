import { emptySpatialExtension, type Instance, type Pose, type SpatialExtension } from '@robopomelo/spec';
import { bundledCatalog, catalogEntry } from '../../packages/spatial/src/index.js';
import type { IsaacExportInput } from '../../packages/isaac-export/src/index.js';
const known = <T,>(value: T, sourceIds: string[] = ['evidence-plan']) => ({ state: 'known' as const, value, sourceIds });
export const catalog = bundledCatalog();
export function instance(id: string, assetId: string, pose: Pose, dims: { lengthM: number; widthM: number; heightM: number }): Instance {
  const entry = catalogEntry(catalog, assetId, '1.0.0');
  return { id, asset: { id: entry.id, version: entry.version, sha256: entry.sha256 }, pose, dimensions: known(dims), sourceIds: ['evidence-plan'] };
}
export const robot = (id: string, pose: Pose, assetId = 'robot-differential'): Instance => instance(id, assetId, pose, { lengthM: 0.8, widthM: 0.6, heightM: 0.4 });
export const station = (id: string, pose: Pose, assetId = 'station'): Instance => instance(id, assetId, pose, { lengthM: 1.4, widthM: 1.4, heightM: 0.2 });
const pose = (xM: number, yM: number, yawRad = 0): Pose => ({ xM, yM, zM: 0, yawRad });
/** Narrow runnable reference: two differential robots, pickup + dropoff stations, two racks. */
export function runnableFixture(): SpatialExtension {
  const ext = emptySpatialExtension();
  ext.robotProfiles.push({ id: 'profile-differential', drive: 'differential', footprintM: [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]], loadedFootprintM: [[-0.5, -0.35], [0.5, -0.35], [0.5, 0.35], [-0.5, 0.35]], heightM: 0.4, maxSpeedMps: 0.5, maxAngularRadps: 1.2, accelerationMps2: 0.6, decelerationMps2: 0.8, reverse: false });
  ext.scenes.push({ id: 'scene-1', name: 'Jetbot cell', floor: known({ lengthM: 16, widthM: 10 }), instances: [
    instance('rack-1', 'rack-bay', pose(5, 5), { lengthM: 2.7, widthM: 1.1, heightM: 4 }),
    instance('rack-2', 'rack-bay', pose(14, 5, Math.PI / 2), { lengthM: 2.7, widthM: 1.1, heightM: 4 }),
    robot('robot-a', pose(2, 2)), robot('robot-b', pose(2, 8)),
    station('station-drop', pose(10, 2)), station('station-pick', pose(10, 8)),
  ] });
  ext.scenarios.push({ id: 'scenario-1', sceneId: 'scene-1', name: 'Two Jetbots', robotProfileIds: ['profile-differential'], fleetSize: known(2),
    stations: [{ id: 'pick', instanceId: 'station-pick', kind: 'pickup', capacity: 1 }, { id: 'drop', instanceId: 'station-drop', kind: 'dropoff', capacity: 1 }],
    workload: { seed: 7, jobs: 30, arrivalsPerHour: 60, mix: [{ fromStationId: 'pick', toStationId: 'drop', share: 0.5 }, { fromStationId: 'drop', toStationId: 'pick', share: 0.5 }] },
    objectives: [{ id: 'objective-throughput', kind: 'throughput', direction: 'maximize', threshold: 50, unit: 'jobs/h', sourceIds: ['evidence-kpi'] }] });
  ext.bindings.push({ id: 'binding-rack', subjectId: 'requirement-rack', sourceIds: ['evidence-plan'], target: { scenarioId: 'scenario-1', recordId: 'rack-1', field: 'instance.dimensions' }, transform: 'unit-conversion', rationale: 'Plan states 270 cm rack bays.', knowledgeState: 'known', confirmedAtRevision: 'rev-3' });
  return ext;
}
export function input(spatial: SpatialExtension, extra: Partial<IsaacExportInput> = {}): IsaacExportInput {
  return {
    spatial, sceneId: 'scene-1', scenarioId: 'scenario-1', catalog,
    source: { sourceRevision: 'rev-3', sourceHash: 'a'.repeat(64), projectId: 'project-1', projectName: 'Jetbot cell' },
    run: null, generatedAt: '2026-09-07T00:00:00.000Z', ...extra,
  };
}
export const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
export const member = (members: { path: string; bytes: Uint8Array }[], path: string) => {
  const found = members.find((m) => m.path === path);
  if (!found) throw new Error(`missing member ${path}: ${members.map((m) => m.path).join(', ')}`);
  return found;
};
export const json = <T = unknown,>(members: { path: string; bytes: Uint8Array }[], path: string): T => JSON.parse(text(member(members, path).bytes)) as T;
