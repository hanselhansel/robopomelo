/** Spatial extension `robopomelo.spatial`. Canonical meters, seconds, radians;
 * right-handed Z-up. Relationships are IDs, never renderer pointers. */
export const SPATIAL_NAMESPACE = 'robopomelo.spatial';
export const SPATIAL_CAPABILITY = 'spatial-planning-v1';
export type Pose = { xM: number; yM: number; zM: number; yawRad: number };
export type SpatialKnowledge<T> =
  | { state: 'known'; value: T; sourceIds: string[] }
  | { state: 'unverified'; value: T; sourceIds: string[] }
  | { state: 'unknown'; reason: string }
  | { state: 'not-applicable'; reason: string };
export type Extents = { lengthM: number; widthM: number; heightM: number };
export type AssetRef = { id: string; version: string; sha256: string };
export type Instance = {
  id: string;
  asset: AssetRef;
  pose: Pose;
  dimensions: SpatialKnowledge<Extents>;
  sourceIds: string[];
};
export type Scene = {
  id: string;
  name: string;
  floor: SpatialKnowledge<{ lengthM: number; widthM: number }>;
  instances: Instance[];
};
export type Drive = 'differential' | 'omnidirectional';
export type RobotProfile = {
  id: string;
  drive: Drive;
  footprintM: [number, number][];
  loadedFootprintM: [number, number][];
  heightM: number;
  maxSpeedMps: number;
  maxAngularRadps: number;
  accelerationMps2: number;
  decelerationMps2: number;
  reverse: boolean;
};
export type StationKind = 'pickup' | 'dropoff' | 'charger' | 'holding';
export type Station = { id: string; instanceId: string; kind: StationKind; capacity: number };
export type Workload = {
  seed: number;
  jobs: number;
  arrivalsPerHour: number;
  mix: { fromStationId: string; toStationId: string; share: number }[];
};
export type ObjectiveKind = 'throughput' | 'fleet-count' | 'cost' | 'max-wait';
export type Objective = {
  id: string;
  kind: ObjectiveKind;
  direction: 'maximize' | 'minimize';
  threshold: number | null;
  unit: string;
  sourceIds: string[];
};
export type Scenario = {
  id: string;
  sceneId: string;
  name: string;
  robotProfileIds: string[];
  fleetSize: SpatialKnowledge<number>;
  stations: Station[];
  workload: Workload | null;
  objectives: Objective[];
};
export type BindingField =
  | 'instance.dimensions'
  | 'robot.maxSpeedMps'
  | 'robot.footprintM'
  | 'scenario.fleetSize'
  | 'workload.arrivalsPerHour'
  | 'workload.jobs'
  | 'objective.threshold';
export type RequirementBinding = {
  id: string;
  subjectId: string;
  sourceIds: string[];
  target: { scenarioId: string; recordId: string; field: BindingField };
  transform: 'identity' | 'unit-conversion' | 'assumption';
  rationale: string;
  knowledgeState: 'known' | 'unverified' | 'assumed' | 'stale';
  confirmedAtRevision: string;
};
export type SpatialExtension = {
  formatVersion: '1.0.0';
  assets: AssetRef[];
  robotProfiles: RobotProfile[];
  scenes: Scene[];
  scenarios: Scenario[];
  bindings: RequirementBinding[];
};
export type SpatialAction =
  | { kind: 'activate'; capability: typeof SPATIAL_CAPABILITY }
  | { kind: 'register-asset'; asset: AssetRef }
  | { kind: 'define-scene'; scene: Omit<Scene, 'instances'> }
  | { kind: 'remove-scene'; id: string }
  | { kind: 'place'; sceneId: string; instance: Instance }
  | { kind: 'move'; sceneId: string; id: string; pose: Pose }
  | { kind: 'resize'; sceneId: string; id: string; dimensions: Instance['dimensions'] }
  | { kind: 'remove'; sceneId: string; id: string; replacementId: string | null }
  | { kind: 'define-robot-profile'; profile: RobotProfile }
  | { kind: 'define-scenario'; scenario: Scenario }
  | { kind: 'remove-scenario'; id: string }
  | { kind: 'bind'; binding: RequirementBinding }
  | { kind: 'unbind'; id: string };
export type SpatialEnvelope = {
  sourceRevision: string;
  sourceHash: string;
  mutationId: string;
  purpose: string;
  actions: SpatialAction[];
};
export const emptySpatialExtension = (): SpatialExtension => ({
  formatVersion: '1.0.0',
  assets: [],
  robotProfiles: [],
  scenes: [],
  scenarios: [],
  bindings: [],
});
