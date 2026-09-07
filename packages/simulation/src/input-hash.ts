import type { RobotProfile, Scenario, Scene, Workload } from '@robopomelo/spec';
import { canonicalJson, sha256Hex, type CompiledObject, type CompiledScene } from '@robopomelo/spatial';
import type { FleetTuning, Policy } from './fleet-types.js';
import { DEFAULT_TOLERANCES, type Tolerances } from './types.js';

/** Inputs whose change can alter a physics result. Anything not listed here
 * (scene or scenario names, display materials, camera, selection, source ids,
 * objectives, bindings) is cosmetic by construction: it is never read. */
export type SemanticInput = {
  compiledScene: CompiledScene;
  scenario: Scenario;
  profiles: readonly RobotProfile[];
  policy: Policy;
  tuning?: Partial<FleetTuning> | undefined;
  tolerances?: Tolerances | undefined;
  seed: number;
};

const volume = (o: CompiledObject) => ({ polygon: o.collision.polygon, zMinM: o.collision.zMinM, zMaxM: o.collision.zMaxM });
const isRobot = (o: CompiledObject): boolean => o.loadedCollision !== undefined;
const sortedJson = (rows: unknown[]): string[] => rows.map(canonicalJson).sort();

/** Physics identity without the run seed: collision volumes (obstacles, robots
 * with loaded footprints and drive offsets), the profiles the scenario names,
 * stations keyed by the id the workload references (their instance is
 * described by its collision volume, so renaming the instance is cosmetic),
 * the workload, policy, tuning and tolerances. */
export function variantHash(input: Omit<SemanticInput, 'seed'>): string {
  const objects = input.compiledScene.objects;
  const byInstance = new Map(objects.map((o) => [o.instanceId, o]));
  const obstacles = sortedJson(objects.filter((o) => !isRobot(o)).map(volume));
  const robots = sortedJson(objects.filter(isRobot).map((o) => ({
    collision: volume(o), loadedCollision: o.loadedCollision, driveOriginOffsetM: o.driveOriginOffsetM ?? null, loadOffsetM: o.loadOffsetM ?? null,
  })));
  const named = new Set(input.scenario.robotProfileIds);
  const profiles = sortedJson(input.profiles.filter((p) => named.has(p.id)).map(({ id: _id, ...physics }) => physics));
  const stations = sortedJson(input.scenario.stations.map((s) => {
    const instance = byInstance.get(s.instanceId);
    return { id: s.id, kind: s.kind, capacity: s.capacity, instance: instance ? volume(instance) : null };
  }));
  const fleet = input.scenario.fleetSize;
  const fleetSize = fleet.state === 'known' || fleet.state === 'unverified' ? fleet.value : null;
  return sha256Hex(canonicalJson({
    obstacles, robots, profiles, stations, fleetSize, workload: input.scenario.workload,
    policy: input.policy, tuning: { ...input.tuning }, tolerances: input.tolerances ?? DEFAULT_TOLERANCES,
  }));
}

/** Semantic input hash of one run: the variant identity plus the run seed. */
export function semanticInputHash(input: SemanticInput): string {
  const { seed, ...variant } = input;
  return sha256Hex(canonicalJson({ variant: variantHash(variant), seed }));
}

export const workloadHash = (workload: Workload | null): string => sha256Hex(canonicalJson(workload));

/** Sorted unique content hashes of every asset the scene places. */
export const assetHashes = (scene: Scene): string[] => [...new Set(scene.instances.map((i) => i.asset.sha256))].sort();
