import {
  checkSchema,
  emptySpatialExtension,
  SPATIAL_CAPABILITY,
  SPATIAL_NAMESPACE,
  type Deployment,
  type Json,
  type Scene,
  type SpatialAction,
  type SpatialExtension,
} from '@robopomelo/spec';
import { DomainError } from './errors.js';
const CAPABILITIES = 'robopomelo.capabilities';
const fail = (code: string, message: string): never => {
  throw new DomainError(code, message);
};
function requireFinite(value: unknown, what: string): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number' && !Number.isFinite(item)) fail('INVALID_VALUE', `${what}.${key} must be a finite number.`);
    if (item && typeof item === 'object') requireFinite(item, `${what}.${key}`);
  }
}
function unique(ids: string[], what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail('DUPLICATE_ID', `${what} ID already exists: ${id}`);
    seen.add(id);
  }
}
/** Reads the activated spatial extension, or throws when the project has not
 * opted in. Stage availability alone never authorizes a spatial write. */
export function spatialExtension(d: Deployment): SpatialExtension | null {
  const raw = d.extensions[SPATIAL_NAMESPACE];
  if (raw === undefined) return null;
  const problems = checkSchema(raw, 'spatial');
  if (problems.length) throw new DomainError('INVALID_SCHEMA', 'The spatial extension does not match its schema.', problems);
  return raw as unknown as SpatialExtension;
}
function activated(d: Deployment): boolean {
  const value = d.extensions[CAPABILITIES] as { required?: unknown } | undefined;
  return !!value && Array.isArray(value.required) && value.required.includes(SPATIAL_CAPABILITY);
}
function activate(candidate: Deployment): void {
  const current = candidate.extensions[CAPABILITIES];
  const required = current && typeof current === 'object' && !Array.isArray(current) && Array.isArray((current as { required?: unknown }).required)
    ? [...((current as { required: unknown[] }).required.filter((v): v is string => typeof v === 'string'))]
    : [];
  if (!required.includes(SPATIAL_CAPABILITY)) required.push(SPATIAL_CAPABILITY);
  candidate.extensions[CAPABILITIES] = { required } as unknown as Json;
  if (candidate.extensions[SPATIAL_NAMESPACE] === undefined) candidate.extensions[SPATIAL_NAMESPACE] = emptySpatialExtension() as unknown as Json;
}
export class SpatialEvaluator {
  #removed = new Map<string, string | null>();
  #spatial: SpatialExtension | null;
  constructor(private readonly candidate: Deployment) {
    this.#spatial = spatialExtension(candidate);
  }
  #ext(): SpatialExtension {
    if (!activated(this.candidate) || !this.#spatial)
      fail('UNSUPPORTED_CAPABILITY', `Activate ${SPATIAL_CAPABILITY} explicitly before writing spatial data.`);
    return this.#spatial!;
  }
  #scene(id: string): Scene {
    return this.#ext().scenes.find((scene) => scene.id === id) ?? fail('RECORD_NOT_FOUND', `Scene does not exist: ${id}`);
  }
  #sources(ids: string[], what: string): void {
    for (const id of ids)
      if (!this.candidate.evidence.some((evidence) => evidence.id === id)) fail('REFERENCE_INVALID', `${what} cites unknown source ${id}.`);
  }
  apply(action: SpatialAction): void {
    requireFinite(action, 'action');
    if (action.kind === 'activate') {
      activate(this.candidate);
      this.#spatial = spatialExtension(this.candidate);
      return;
    }
    const ext = this.#ext();
    switch (action.kind) {
      case 'register-asset':
        if (ext.assets.some((asset) => asset.id === action.asset.id && asset.version === action.asset.version)) fail('DUPLICATE_ID', `Asset already registered: ${action.asset.id}@${action.asset.version}`);
        ext.assets.push(structuredClone(action.asset));
        return;
      case 'define-scene': {
        const existing = ext.scenes.find((scene) => scene.id === action.scene.id);
        if (existing) Object.assign(existing, structuredClone(action.scene));
        else ext.scenes.push({ ...structuredClone(action.scene), instances: [] });
        return;
      }
      case 'remove-scene':
        if (ext.scenarios.some((scenario) => scenario.sceneId === action.id)) fail('REFERENCE_INVALID', `Scene ${action.id} is referenced by a scenario.`);
        if (!ext.scenes.some((scene) => scene.id === action.id)) fail('RECORD_NOT_FOUND', `Scene does not exist: ${action.id}`);
        ext.scenes = ext.scenes.filter((scene) => scene.id !== action.id);
        return;
      case 'place': {
        const scene = this.#scene(action.sceneId);
        if (!ext.assets.some((asset) => asset.id === action.instance.asset.id && asset.version === action.instance.asset.version && asset.sha256 === action.instance.asset.sha256))
          fail('ASSET_UNKNOWN', `Asset is not registered for this project: ${action.instance.asset.id}@${action.instance.asset.version}`);
        if (ext.scenes.some((row) => row.instances.some((instance) => instance.id === action.instance.id))) fail('DUPLICATE_ID', `Instance ID already exists: ${action.instance.id}`);
        this.#sources(action.instance.sourceIds, `Instance ${action.instance.id}`);
        if (action.instance.dimensions.state === 'known' || action.instance.dimensions.state === 'unverified') this.#sources(action.instance.dimensions.sourceIds, `Instance ${action.instance.id} dimensions`);
        scene.instances.push(structuredClone(action.instance));
        this.#removed.delete(action.instance.id);
        return;
      }
      case 'move':
      case 'resize': {
        const scene = this.#scene(action.sceneId);
        const instance = scene.instances.find((row) => row.id === action.id) ?? fail('RECORD_NOT_FOUND', `Instance does not exist: ${action.id}`);
        if (action.kind === 'move') instance.pose = structuredClone(action.pose);
        else {
          if (action.dimensions.state === 'known' || action.dimensions.state === 'unverified') this.#sources(action.dimensions.sourceIds, `Instance ${action.id} dimensions`);
          instance.dimensions = structuredClone(action.dimensions);
        }
        return;
      }
      case 'remove': {
        const scene = this.#scene(action.sceneId);
        if (!scene.instances.some((row) => row.id === action.id)) fail('RECORD_NOT_FOUND', `Instance does not exist: ${action.id}`);
        scene.instances = scene.instances.filter((row) => row.id !== action.id);
        this.#removed.set(action.id, action.replacementId);
        return;
      }
      case 'define-robot-profile': {
        requireFinite(action.profile, 'profile');
        const index = ext.robotProfiles.findIndex((profile) => profile.id === action.profile.id);
        if (index >= 0) ext.robotProfiles[index] = structuredClone(action.profile);
        else ext.robotProfiles.push(structuredClone(action.profile));
        return;
      }
      case 'define-scenario': {
        this.#scene(action.scenario.sceneId);
        for (const id of action.scenario.robotProfileIds) if (!ext.robotProfiles.some((profile) => profile.id === id)) fail('REFERENCE_INVALID', `Unknown robot profile ${id}.`);
        unique(action.scenario.stations.map((station) => station.id), 'Station');
        unique(action.scenario.objectives.map((objective) => objective.id), 'Objective');
        for (const objective of action.scenario.objectives) this.#sources(objective.sourceIds, `Objective ${objective.id}`);
        if (action.scenario.fleetSize.state === 'known' || action.scenario.fleetSize.state === 'unverified') this.#sources(action.scenario.fleetSize.sourceIds, 'Fleet size');
        const index = ext.scenarios.findIndex((scenario) => scenario.id === action.scenario.id);
        if (index >= 0) ext.scenarios[index] = structuredClone(action.scenario);
        else ext.scenarios.push(structuredClone(action.scenario));
        return;
      }
      case 'remove-scenario':
        if (!ext.scenarios.some((scenario) => scenario.id === action.id)) fail('RECORD_NOT_FOUND', `Scenario does not exist: ${action.id}`);
        ext.scenarios = ext.scenarios.filter((scenario) => scenario.id !== action.id);
        ext.bindings = ext.bindings.filter((binding) => binding.target.scenarioId !== action.id);
        return;
      case 'bind': {
        this.#sources(action.binding.sourceIds, `Binding ${action.binding.id}`);
        const index = ext.bindings.findIndex((binding) => binding.id === action.binding.id);
        if (index >= 0) ext.bindings[index] = structuredClone(action.binding);
        else ext.bindings.push(structuredClone(action.binding));
        return;
      }
      case 'unbind':
        if (!ext.bindings.some((binding) => binding.id === action.id)) fail('RECORD_NOT_FOUND', `Binding does not exist: ${action.id}`);
        ext.bindings = ext.bindings.filter((binding) => binding.id !== action.id);
        return;
    }
  }
  /** Removed instances must be remapped or their dependents removed in the same mutation. */
  finish(): void {
    if (!this.#spatial) return;
    const ext = this.#ext();
    const live = new Set(ext.scenes.flatMap((scene) => scene.instances.map((instance) => instance.id)));
    for (const [removed, replacement] of this.#removed) {
      if (replacement !== null && !live.has(replacement)) fail('REFERENCE_INVALID', `Replacement instance ${replacement} does not exist.`);
      for (const scenario of ext.scenarios)
        for (const station of scenario.stations)
          if (station.instanceId === removed) {
            if (replacement === null) return fail('REFERENCE_INVALID', `Instance ${removed} is referenced by ${station.id}; remap or remove the dependent in the same change.`);
            station.instanceId = replacement;
          }
      for (const binding of ext.bindings)
        if (binding.target.recordId === removed) {
          if (replacement === null) return fail('REFERENCE_INVALID', `Instance ${removed} is bound by ${binding.id}; remap or unbind it in the same change.`);
          binding.target.recordId = replacement;
        }
    }
    for (const scenario of ext.scenarios) {
      if (!ext.scenes.some((scene) => scene.id === scenario.sceneId)) fail('REFERENCE_INVALID', `Scenario ${scenario.id} references a missing scene.`);
      for (const station of scenario.stations) if (!live.has(station.instanceId)) fail('REFERENCE_INVALID', `Station ${station.id} references a missing instance.`);
      const stationIds = new Set(scenario.stations.map((station) => station.id));
      for (const row of scenario.workload?.mix ?? [])
        if (!stationIds.has(row.fromStationId) || !stationIds.has(row.toStationId)) fail('REFERENCE_INVALID', `Workload mix in ${scenario.id} references a missing station.`);
    }
    for (const binding of ext.bindings)
      if (!ext.scenarios.some((scenario) => scenario.id === binding.target.scenarioId)) fail('REFERENCE_INVALID', `Binding ${binding.id} targets a missing scenario.`);
    const problems = checkSchema(ext, 'spatial');
    if (problems.length) throw new DomainError('INVALID_SCHEMA', 'The spatial extension does not match its schema after this change.', problems);
  }
}
/** Evidence IDs cited anywhere in the spatial extension. Used by the planning
 * projection so a cited source edit invalidates approval. */
export function spatialSourceIds(d: Deployment): string[] {
  const raw = d.extensions[SPATIAL_NAMESPACE];
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    for (const [key, item] of Object.entries(value)) {
      if (key === 'sourceIds' && Array.isArray(item)) for (const id of item) if (typeof id === 'string') ids.add(id);
      visit(item);
    }
  };
  visit(raw);
  return [...ids];
}
