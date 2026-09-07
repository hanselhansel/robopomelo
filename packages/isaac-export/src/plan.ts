import type { Drive, Pose, Scenario, SpatialExtension, StationKind, Workload } from '@robopomelo/spec';
import { catalogEntry, compileScene, explainBindings, type BindingExplanation, type Catalog, type CompiledObject, type CompiledScene } from '@robopomelo/spatial';
import { fail } from './errors.js';
import { ISAAC_6_0_0_UBUNTU_2404_X86_64, robotAssetFor, type IsaacTargetProfile } from './profile.js';
export type IsaacSource = { sourceRevision: string; sourceHash: string; projectId: string; projectName: string };
export type IsaacRun = { runId: string; manifestSha256: string };
export type IsaacExportInput = {
  spatial: SpatialExtension; sceneId: string; scenarioId: string; catalog: Catalog;
  source: IsaacSource; run?: IsaacRun | null; generatedAt: string; requireRunnable?: boolean;
};
export type UnsupportedEntry = { code: string; kind: 'robot' | 'station' | 'workload' | 'objective' | 'binding' | 'scene' | 'instance'; id: string; reason: string };
export type IsaacRobot = { id: string; drive: Drive; profileId: string | null; targetRobot: 'jetbot'; usdRelativePath: string; startPose: Pose };
export type IsaacStation = { id: string; instanceId: string; kind: StationKind; pose: Pose };
export type IsaacFloor = { lengthM: number; widthM: number; state: 'known' | 'unverified' | 'derived' };
export type IsaacExportMode = 'runnable-reference' | 'importable-only';
export type IsaacExportPlan = {
  profile: IsaacTargetProfile; mode: IsaacExportMode; runnableBadge: boolean; remainingSetup: string[]; unsupported: UnsupportedEntry[];
  sceneId: string; scenarioId: string; scene: CompiledScene; floor: IsaacFloor; scenario: Scenario;
  robots: IsaacRobot[]; stations: IsaacStation[]; workload: Workload | null; bindings: BindingExplanation[];
  source: IsaacSource; run: IsaacRun | null; generatedAt: string;
};
const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
class Collector {
  readonly remaining: string[] = []; readonly unsupported: UnsupportedEntry[] = [];
  omit(entry: UnsupportedEntry, setup?: string): void { this.unsupported.push(entry); if (setup) this.remaining.push(setup); }
}
function floorFor(input: IsaacExportInput, scene: CompiledScene, out: Collector): IsaacFloor {
  const floor = input.spatial.scenes.find((row) => row.id === input.sceneId)!.floor;
  if (floor.state === 'known' || floor.state === 'unverified') return { lengthM: floor.value.lengthM, widthM: floor.value.widthM, state: floor.state };
  let maxX = 0, maxY = 0;
  for (const [x, y] of scene.objects.flatMap((object) => object.collision.polygon)) { maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  out.omit({ code: 'FLOOR_UNKNOWN', kind: 'scene', id: scene.sceneId, reason: `floor extents are ${floor.state}; export derives a floor from object bounds plus 1 m` }, `Confirm floor extents for scene ${scene.sceneId} (currently ${floor.state}).`);
  return { lengthM: maxX + 1, widthM: maxY + 1, state: 'derived' };
}
function robotsFor(input: IsaacExportInput, scenario: Scenario, objects: readonly CompiledObject[], out: Collector): IsaacRobot[] {
  const profile = ISAAC_6_0_0_UBUNTU_2404_X86_64, robots: IsaacRobot[] = [];
  const profiles = input.spatial.robotProfiles.filter((row) => scenario.robotProfileIds.includes(row.id)).sort(byId);
  for (const object of objects) {
    const spec = catalogEntry(input.catalog, object.assetId, object.assetVersion).robot;
    if (!spec) continue;
    const asset = robotAssetFor(profile, object.assetId);
    if (!profile.supportedDrives.includes(spec.drive) || !asset) {
      out.omit({ code: 'DRIVE_UNSUPPORTED', kind: 'robot', id: object.instanceId, reason: `${object.assetId} (${spec.drive}) has no supported target robot; exported as a static collision box only` }, `Replace or remove robot ${object.instanceId}: drive ${spec.drive} / asset ${object.assetId} is not supported on ${profile.targetId}.`);
      continue;
    }
    if (robots.length >= profile.maxRobots) { out.omit({ code: 'ROBOT_BEYOND_MAX', kind: 'robot', id: object.instanceId, reason: `more than ${profile.maxRobots} supported robots; exported as a static collision box only` }); continue; }
    const match = profiles.find((row) => row.drive === spec.drive);
    if (!match) out.remaining.push(`Add a ${spec.drive} robot profile to scenario ${scenario.id} for robot ${object.instanceId}.`);
    robots.push({ id: object.instanceId, drive: spec.drive, profileId: match?.id ?? null, targetRobot: asset.targetRobot, usdRelativePath: asset.usdRelativePath, startPose: { ...object.display.pose } });
  }
  const total = robots.length + out.unsupported.filter((row) => row.code === 'ROBOT_BEYOND_MAX').length;
  if (total > profile.maxRobots) out.remaining.push(`Scene has ${total} supported robots; the reference allows maxRobots ${profile.maxRobots}. Remove ${total - profile.maxRobots}.`);
  if (robots.length === 0) out.remaining.push(`Place at least one supported robot instance (${profile.supportedRobotAssets.map((row) => row.catalogId).join(', ')}).`);
  if (scenario.fleetSize.state === 'known' || scenario.fleetSize.state === 'unverified') {
    if (scenario.fleetSize.value !== total) out.unsupported.push({ code: 'FLEET_SIZE_MISMATCH', kind: 'robot', id: scenario.id, reason: `scenario fleetSize ${scenario.fleetSize.value} differs from ${total} placed robot instances; the export uses placed instances` });
  }
  return robots;
}
function stationsFor(scenario: Scenario, objects: readonly CompiledObject[], out: Collector): IsaacStation[] {
  const profile = ISAAC_6_0_0_UBUNTU_2404_X86_64, stations: IsaacStation[] = [];
  for (const station of scenario.stations) {
    const object = objects.find((row) => row.instanceId === station.instanceId);
    if (!object) { out.omit({ code: 'STATION_INSTANCE_MISSING', kind: 'station', id: station.id, reason: `instance ${station.instanceId} is not in scene ${scenario.sceneId}` }, `Place instance ${station.instanceId} for station ${station.id}.`); continue; }
    if (!profile.supportedStationKinds.includes(station.kind)) { out.omit({ code: 'STATION_KIND_UNSUPPORTED', kind: 'station', id: station.id, reason: `station kind ${station.kind} is not part of the reference; its instance is exported as static geometry only` }, `Remove station ${station.id}: kind ${station.kind} is not supported (${profile.supportedStationKinds.join(', ')}).`); continue; }
    if (stations.length >= profile.maxStations) { out.omit({ code: 'STATION_BEYOND_MAX', kind: 'station', id: station.id, reason: `more than ${profile.maxStations} stations` }, `Remove station ${station.id}: the reference allows maxStations ${profile.maxStations}.`); continue; }
    stations.push({ id: station.id, instanceId: station.instanceId, kind: station.kind, pose: { ...object.display.pose } });
  }
  if (stations.length !== profile.maxStations) out.remaining.push(`Define exactly ${profile.maxStations} supported stations (${profile.supportedStationKinds.join(', ')}); found ${stations.length}.`);
  return stations;
}
function workloadFor(scenario: Scenario, stations: IsaacStation[], out: Collector): Workload | null {
  const workload = scenario.workload;
  if (!workload) { out.omit({ code: 'WORKLOAD_MISSING', kind: 'workload', id: scenario.id, reason: 'scenario has no workload; no goals are exported' }, `Define a workload for scenario ${scenario.id}.`); return null; }
  const ids = new Set(stations.map((row) => row.id));
  const problems: string[] = [];
  if (!Number.isInteger(workload.seed) || workload.seed < 1 || workload.seed > 0xffffffff) problems.push('seed must be an integer in 1..4294967295');
  if (!Number.isSafeInteger(workload.jobs) || workload.jobs < 1) problems.push('jobs must be a positive integer');
  if (workload.mix.length === 0) problems.push('mix must not be empty');
  for (const row of workload.mix) {
    if (!(row.share > 0) || !Number.isFinite(row.share)) problems.push(`mix share ${row.share} must be positive`);
    for (const id of [row.fromStationId, row.toStationId]) if (!ids.has(id)) problems.push(`mix references station ${id}, which is not an exported station`);
  }
  if (problems.length > 0) { out.omit({ code: 'WORKLOAD_INVALID', kind: 'workload', id: scenario.id, reason: problems.join('; ') }, `Fix workload of scenario ${scenario.id}: ${problems.join('; ')}.`); return null; }
  return workload;
}
function reportRest(input: IsaacExportInput, scenario: Scenario, scene: CompiledScene, out: Collector): BindingExplanation[] {
  for (const objective of scenario.objectives) if (objective.kind !== 'throughput') out.unsupported.push({ code: 'OBJECTIVE_UNSUPPORTED', kind: 'objective', id: objective.id, reason: `objective kind ${objective.kind} is not evaluated by the reference run; only throughput goals are exported` });
  for (const object of scene.objects) if (object.dimensionState === 'estimated') out.omit({ code: 'DIMENSIONS_ESTIMATED', kind: 'instance', id: object.instanceId, reason: 'dimensions are unknown; collision uses catalog defaults' }, `Confirm dimensions of instance ${object.instanceId}.`);
  const bindings = explainBindings(input.spatial).filter((row) => row.scenarioId === scenario.id);
  for (const row of bindings) if (row.state === 'stale' || row.state === 'unresolved') out.omit({ code: 'BINDING_NOT_CONFIRMED', kind: 'binding', id: row.id, reason: `binding is ${row.state}; its value is exported as currently stored but is not confirmed` }, `Confirm binding ${row.id} (${row.field} of ${row.recordId}) which is ${row.state}.`);
  return bindings;
}
/** Decides runnable-reference vs importable-only and collects everything the export cannot represent. */
export function planIsaacExport(input: IsaacExportInput): IsaacExportPlan {
  const sceneRecord = input.spatial.scenes.find((row) => row.id === input.sceneId) ?? fail('RECORD_NOT_FOUND', `scene ${input.sceneId} does not exist`);
  const scenario = input.spatial.scenarios.find((row) => row.id === input.scenarioId) ?? fail('RECORD_NOT_FOUND', `scenario ${input.scenarioId} does not exist`);
  if (scenario.sceneId !== sceneRecord.id) fail('RECORD_NOT_FOUND', `scenario ${scenario.id} belongs to scene ${scenario.sceneId}, not ${sceneRecord.id}`);
  if (typeof input.generatedAt !== 'string' || !input.generatedAt) fail('INPUT_INVALID', 'generatedAt must be supplied by the caller');
  const scene = compileScene(sceneRecord, input.catalog), out = new Collector();
  const floor = floorFor(input, scene, out);
  const robots = robotsFor(input, scenario, scene.objects, out);
  const stations = stationsFor(scenario, scene.objects, out);
  const workload = workloadFor(scenario, stations, out);
  const bindings = reportRest(input, scenario, scene, out);
  const mode: IsaacExportMode = out.remaining.length === 0 ? 'runnable-reference' : 'importable-only';
  if (mode !== 'runnable-reference' && input.requireRunnable) fail('MAPPING_INCOMPLETE', `runnable reference requested but mapping is incomplete: ${out.remaining.join(' ')}`);
  return {
    profile: ISAAC_6_0_0_UBUNTU_2404_X86_64, mode, runnableBadge: mode === 'runnable-reference', remainingSetup: out.remaining, unsupported: out.unsupported,
    sceneId: scene.sceneId, scenarioId: scenario.id, scene, floor, scenario, robots, stations, workload, bindings,
    source: { ...input.source }, run: input.run ? { ...input.run } : null, generatedAt: input.generatedAt,
  };
}
