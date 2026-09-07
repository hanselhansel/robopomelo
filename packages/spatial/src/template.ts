import type { Extents, Objective, Pose, Scenario, SpatialAction, StationKind, Workload } from '@robopomelo/spec';
import { behaviorFor, compatibleWith, type BehaviorProfile } from './behavior.js';
import { assertSafeData, assetRefFor, catalogEntry, type Catalog, type NumberParameter } from './catalog.js';
import { isPose, resolveParameters } from './geometry.js';
import { SpatialError } from './hash.js';
/** Scenario templates: a reviewed scene recipe, station behavior references,
 * workload defaults and objectives, instantiated with bounded overrides into
 * ordinary spatial actions. Every id comes from the caller's generator. */
export type TemplatePlacement = { instanceId: string; asset: { id: string; version: string }; pose: Pose; dimensions?: Extents };
export type TemplateStation = { id: string; instanceId: string; kind: StationKind; capacity: number; behavior: { id: string; version: string } };
export type ScenarioTemplate = {
  id: string; version: string; name: string;
  parameters: Record<string, NumberParameter>;
  sceneRecipe: { floor: { lengthM: number; widthM: number }; placements: TemplatePlacement[] };
  stations: TemplateStation[];
  robotProfileIds: string[];
  workloadDefaults: Workload;
  objectives: Objective[];
};
export type TemplateContext = { catalog: Catalog; behaviors: readonly BehaviorProfile[]; ids: () => string; sceneName?: string };
/** Closed set of override targets; a template cannot invent new binding points. */
export const TEMPLATE_PARAMETERS = Object.freeze(['arrivalsPerHour', 'jobs', 'fleetSize', 'seed'] as const);
export type TemplateParameterName = (typeof TEMPLATE_PARAMETERS)[number];
const INTEGER: ReadonlySet<TemplateParameterName> = new Set(['jobs', 'fleetSize', 'seed']);
const ID = /^[a-z][a-z0-9-]{0,63}$/, VERSION = /^\d+\.\d+\.\d+$/;
const fail = (code: string, message: string): never => { throw new SpatialError(code, message); };
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const nonEmpty = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function validateTemplate(value: unknown): ScenarioTemplate {
  assertSafeData(value, 'template');
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('TEMPLATE_INVALID', 'A template must be an object.');
  const t = value as Record<string, unknown>;
  const keys = ['id', 'version', 'name', 'parameters', 'sceneRecipe', 'stations', 'robotProfileIds', 'workloadDefaults', 'objectives'];
  for (const key of keys) if (!Object.hasOwn(t, key)) fail('TEMPLATE_INVALID', `Template is missing ${key}.`);
  for (const key of Object.keys(t)) if (!keys.includes(key)) fail('TEMPLATE_INVALID', `Template has unknown field ${key}.`);
  if (!nonEmpty(t.id, 64) || !ID.test(t.id)) fail('TEMPLATE_INVALID', 'Template id must be a lowercase slug.');
  if (!nonEmpty(t.version, 32) || !VERSION.test(t.version)) fail('TEMPLATE_INVALID', 'Template version must be semantic.');
  if (!nonEmpty(t.name, 128)) fail('TEMPLATE_INVALID', 'Template name must be 1 to 128 characters.');
  const parameters = t.parameters as Record<string, unknown>;
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) fail('TEMPLATE_INVALID', 'parameters must be an object.');
  for (const [name, spec] of Object.entries(parameters)) {
    if (!TEMPLATE_PARAMETERS.includes(name as TemplateParameterName)) fail('TEMPLATE_INVALID', `Parameter ${name} is not a supported override; use ${TEMPLATE_PARAMETERS.join(', ')}.`);
    const p = (spec ?? {}) as Record<string, unknown>, [minimum, maximum, value] = [p.minimum, p.maximum, p.default];
    if (p.type !== 'number' || !finite(minimum) || !finite(maximum) || !finite(value) || !nonEmpty(p.description, 512)) return fail('TEMPLATE_INVALID', `Parameter ${name} must be a described bounded number.`);
    if (minimum > maximum || value < minimum || value > maximum) fail('PARAMETER_OUT_OF_RANGE', `Parameter ${name} default is outside its bounds.`);
  }
  const scene = t.sceneRecipe as Record<string, unknown>;
  if (!scene || typeof scene !== 'object' || !Array.isArray(scene.placements) || scene.placements.length === 0 || scene.placements.length > 5000) fail('TEMPLATE_INVALID', 'sceneRecipe needs 1 to 5000 placements.');
  const floor = scene.floor as Record<string, unknown>;
  if (!floor || !finite(floor.lengthM) || !finite(floor.widthM) || floor.lengthM <= 0 || floor.widthM <= 0) fail('TEMPLATE_INVALID', 'sceneRecipe.floor needs positive lengthM and widthM.');
  const seen = new Set<string>();
  for (const placement of scene.placements as Record<string, unknown>[]) {
    const instanceId = placement?.instanceId;
    if (!nonEmpty(instanceId, 128) || seen.has(instanceId)) return fail('TEMPLATE_INVALID', 'Every placement needs a unique instanceId.');
    seen.add(instanceId);
    const asset = placement.asset as Record<string, unknown>;
    if (!asset || !nonEmpty(asset.id, 64) || !nonEmpty(asset.version, 32)) fail('TEMPLATE_INVALID', `Placement ${placement.instanceId} needs an asset id and version.`);
    if (!isPose(placement.pose)) fail('POSE_INVALID', `Placement ${placement.instanceId} pose needs finite xM, yM, zM and yawRad.`);
  }
  if (!Array.isArray(t.stations) || !Array.isArray(t.robotProfileIds) || !Array.isArray(t.objectives)) fail('TEMPLATE_INVALID', 'stations, robotProfileIds and objectives must be arrays.');
  for (const station of t.stations as Record<string, unknown>[]) {
    if (!nonEmpty(station?.id, 128) || !seen.has(station.instanceId as string)) fail('TEMPLATE_INVALID', `Station ${String(station?.id)} must reference a placed instance.`);
    if (!['pickup', 'dropoff', 'charger', 'holding'].includes(station.kind as string)) fail('TEMPLATE_INVALID', `Station ${station.id} has an unknown kind.`);
    if (!Number.isInteger(station.capacity) || (station.capacity as number) < 1) fail('PARAMETER_OUT_OF_RANGE', `Station ${station.id} capacity must be a positive integer.`);
    const b = station.behavior as Record<string, unknown>;
    if (!b || !nonEmpty(b.id, 64) || !nonEmpty(b.version, 32)) fail('TEMPLATE_INVALID', `Station ${station.id} needs a behavior reference.`);
  }
  const w = t.workloadDefaults as Record<string, unknown>;
  if (!w || !Number.isInteger(w.seed) || !Number.isInteger(w.jobs) || !finite(w.arrivalsPerHour) || !Array.isArray(w.mix)) fail('TEMPLATE_INVALID', 'workloadDefaults needs seed, jobs, arrivalsPerHour and mix.');
  return value as ScenarioTemplate;
}
function resolveOverrides(template: ScenarioTemplate, overrides: Record<string, number>): Record<string, number> {
  for (const name of Object.keys(overrides)) if (!Object.hasOwn(template.parameters, name)) fail('PARAMETER_UNKNOWN', `Template ${template.id} has no override ${name}.`);
  const resolved: Record<string, number> = {};
  for (const [name, spec] of Object.entries(template.parameters)) {
    const value = Object.hasOwn(overrides, name) ? overrides[name]! : spec.default;
    if (!finite(value) || value < spec.minimum || value > spec.maximum || (INTEGER.has(name as TemplateParameterName) && !Number.isInteger(value)))
      fail('PARAMETER_OUT_OF_RANGE', `${template.id}.${name} must be ${INTEGER.has(name as TemplateParameterName) ? 'an integer' : 'a number'} in [${spec.minimum}, ${spec.maximum}].`);
    resolved[name] = value;
  }
  return resolved;
}
/** Deterministic: the caller's id generator names the scene and scenario, in that order. */
export function instantiateTemplate(template: ScenarioTemplate, overrides: Record<string, number>, context: TemplateContext): SpatialAction[] {
  validateTemplate(template);
  const params = resolveOverrides(template, overrides);
  const sceneId = context.ids(), scenarioId = context.ids();
  const actions: SpatialAction[] = [{ kind: 'define-scene', scene: { id: sceneId, name: context.sceneName ?? template.name, floor: { state: 'unverified', value: { ...template.sceneRecipe.floor }, sourceIds: [] } } }];
  const registered = new Set<string>(), places: SpatialAction[] = [];
  for (const placement of template.sceneRecipe.placements) {
    const entry = catalogEntry(context.catalog, placement.asset.id, placement.asset.version), key = `${entry.id}@${entry.version}`;
    if (!registered.has(key)) { registered.add(key); actions.push({ kind: 'register-asset', asset: assetRefFor(entry) }); }
    const resolved = resolveParameters(entry, placement.dimensions ? { lengthM: placement.dimensions.lengthM, widthM: placement.dimensions.widthM, heightM: placement.dimensions.heightM } : {});
    const value: Extents = { lengthM: resolved.lengthM!, widthM: resolved.widthM!, heightM: resolved.heightM! };
    places.push({ kind: 'place', sceneId, instance: { id: placement.instanceId, asset: assetRefFor(entry), pose: { ...placement.pose }, dimensions: { state: 'unverified', value, sourceIds: [] }, sourceIds: [] } });
  }
  actions.push(...places);
  const stations = template.stations.map((station) => {
    const behavior = behaviorFor(context.behaviors, station.behavior.id, station.behavior.version);
    if (!compatibleWith(behavior, station.kind)) fail('BEHAVIOR_INCOMPATIBLE', `Behavior ${behavior.id} does not apply to ${station.kind} station ${station.id}.`);
    return { id: station.id, instanceId: station.instanceId, kind: station.kind, capacity: station.capacity };
  });
  const workload: Workload = {
    ...template.workloadDefaults, mix: template.workloadDefaults.mix.map((m) => ({ ...m })),
    ...(params.arrivalsPerHour !== undefined ? { arrivalsPerHour: params.arrivalsPerHour } : {}),
    ...(params.jobs !== undefined ? { jobs: params.jobs } : {}), ...(params.seed !== undefined ? { seed: params.seed } : {}),
  };
  const scenario: Scenario = {
    id: scenarioId, sceneId, name: template.name, robotProfileIds: [...template.robotProfileIds],
    fleetSize: params.fleetSize !== undefined ? { state: 'unverified', value: params.fleetSize, sourceIds: [] } : { state: 'unknown', reason: 'Fleet size is chosen per study.' },
    stations, workload, objectives: template.objectives.map((o) => ({ ...o, sourceIds: [...o.sourceIds] })),
  };
  actions.push({ kind: 'define-scenario', scenario });
  return actions;
}
const pose = (xM: number, yM: number, yawRad = 0): Pose => ({ xM, yM, zM: 0, yawRad });
/** Fixture: pallets arrive at a receiving station and are staged along a rack row. */
export const RECEIVING_TO_STAGING_TEMPLATE: ScenarioTemplate = Object.freeze({
  id: 'receiving-to-staging', version: '1.0.0', name: 'Receiving to staging',
  parameters: {
    arrivalsPerHour: { type: 'number', minimum: 1, maximum: 600, default: 60, description: 'Inbound pallets per hour at receiving.' },
    jobs: { type: 'number', minimum: 1, maximum: 10_000, default: 200, description: 'Jobs simulated per run.' },
    fleetSize: { type: 'number', minimum: 1, maximum: 50, default: 4, description: 'Robots available for the study.' },
  },
  sceneRecipe: {
    floor: { lengthM: 40, widthM: 20 },
    placements: [
      { instanceId: 'receiving-dock', asset: { id: 'station', version: '1.0.0' }, pose: pose(-15, -6) },
      { instanceId: 'staging-lane', asset: { id: 'station', version: '1.0.0' }, pose: pose(12, 4) },
      { instanceId: 'staging-rack', asset: { id: 'rack-row', version: '1.0.0' }, pose: pose(12, 7) },
      { instanceId: 'north-wall', asset: { id: 'wall-segment', version: '1.0.0' }, pose: pose(0, 9.9), dimensions: { lengthM: 40, widthM: 0.2, heightM: 6 } },
    ],
  },
  stations: [
    { id: 'receiving', instanceId: 'receiving-dock', kind: 'pickup', capacity: 2, behavior: { id: 'station-queue-standard', version: '1.0.0' } },
    { id: 'staging', instanceId: 'staging-lane', kind: 'dropoff', capacity: 2, behavior: { id: 'station-queue-standard', version: '1.0.0' } },
  ],
  robotProfileIds: [],
  workloadDefaults: { seed: 1, jobs: 200, arrivalsPerHour: 60, mix: [{ fromStationId: 'receiving', toStationId: 'staging', share: 1 }] },
  objectives: [{ id: 'throughput', kind: 'throughput', direction: 'maximize', threshold: null, unit: 'pallets/hour', sourceIds: [] }],
}) as ScenarioTemplate;
