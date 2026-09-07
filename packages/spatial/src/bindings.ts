import type { RequirementBinding, SpatialExtension } from '@robopomelo/spec';
export interface ResolvedBinding {
  binding: RequirementBinding;
  value: unknown;
  state: RequirementBinding['knowledgeState'] | 'unresolved';
  transform: RequirementBinding['transform'];
  explanation: string;
}
/** Reads the bound field from validated records. Targets are enumerated
 * semantic fields, never arbitrary paths or executable expressions. */
export function resolveBinding(ext: SpatialExtension, binding: RequirementBinding): ResolvedBinding {
  const { scenarioId, recordId, field } = binding.target;
  const scenario = ext.scenarios.find((row) => row.id === scenarioId);
  const unresolved = (why: string): ResolvedBinding => ({ binding, value: null, state: 'unresolved', transform: binding.transform, explanation: `${binding.id}: ${why}` });
  if (!scenario) return unresolved(`scenario ${scenarioId} does not exist`);
  let value: unknown;
  switch (field) {
    case 'instance.dimensions': {
      const scene = ext.scenes.find((row) => row.id === scenario.sceneId);
      const instance = scene?.instances.find((row) => row.id === recordId);
      if (!instance) return unresolved(`instance ${recordId} does not exist in scene ${scenario.sceneId}`);
      value = instance.dimensions.state === 'known' || instance.dimensions.state === 'unverified' ? instance.dimensions.value : null;
      break;
    }
    case 'robot.maxSpeedMps':
    case 'robot.footprintM': {
      const profile = ext.robotProfiles.find((row) => row.id === recordId);
      if (!profile) return unresolved(`robot profile ${recordId} does not exist`);
      value = field === 'robot.maxSpeedMps' ? profile.maxSpeedMps : profile.footprintM;
      break;
    }
    case 'scenario.fleetSize':
      value = scenario.fleetSize.state === 'known' || scenario.fleetSize.state === 'unverified' ? scenario.fleetSize.value : null;
      break;
    case 'workload.arrivalsPerHour':
    case 'workload.jobs':
      if (!scenario.workload) return unresolved(`scenario ${scenarioId} has no workload`);
      value = field === 'workload.jobs' ? scenario.workload.jobs : scenario.workload.arrivalsPerHour;
      break;
    case 'objective.threshold': {
      const objective = scenario.objectives.find((row) => row.id === recordId);
      if (!objective) return unresolved(`objective ${recordId} does not exist`);
      value = objective.threshold;
      break;
    }
  }
  return {
    binding, value, state: binding.knowledgeState, transform: binding.transform,
    explanation: `${binding.id}: ${field} of ${recordId} is ${binding.knowledgeState} via ${binding.transform} from ${binding.sourceIds.join(', ') || 'no cited source'}. ${binding.rationale}`,
  };
}
/** Targeted invalidation: only bindings citing a changed source become stale.
 * Unchanged bindings are returned by identity so callers can prove preservation. */
export function invalidateBindings(bindings: readonly RequirementBinding[], changedSourceIds: readonly string[]): RequirementBinding[] {
  const changed = new Set(changedSourceIds);
  return bindings.map((binding) =>
    binding.knowledgeState !== 'stale' && binding.sourceIds.some((id) => changed.has(id)) ? { ...binding, knowledgeState: 'stale' } : binding);
}
export function affectedScenarios(bindings: readonly RequirementBinding[]): string[] {
  return [...new Set(bindings.map((binding) => binding.target.scenarioId))].sort();
}
/** A user override never erases provenance: the new binding cites the new
 * source first, keeps the old sources, and names the binding it supersedes. */
export function overrideBinding(previous: RequirementBinding, input: { id: string; rationale: string; revision: string; sourceIds: string[] }): RequirementBinding {
  if (!input.rationale.trim()) throw new Error('BINDING_RATIONALE_REQUIRED: an override needs a rationale.');
  return {
    id: input.id,
    subjectId: previous.subjectId,
    sourceIds: [...new Set([...input.sourceIds, ...previous.sourceIds])],
    target: { ...previous.target },
    transform: 'assumption',
    rationale: `${input.rationale.trim()} (supersedes ${previous.id}: ${previous.rationale})`,
    knowledgeState: 'assumed',
    confirmedAtRevision: input.revision,
  };
}
export interface BindingExplanation {
  id: string;
  subjectId: string;
  field: RequirementBinding['target']['field'];
  recordId: string;
  scenarioId: string;
  state: ResolvedBinding['state'];
  transform: RequirementBinding['transform'];
  value: unknown;
  sources: string[];
  rationale: string;
  text: string;
}
/** Readable rows for the engineering handoff; labels fall back to raw IDs. */
export function explainBindings(ext: SpatialExtension, labels: ReadonlyMap<string, string> = new Map()): BindingExplanation[] {
  return ext.bindings.map((binding) => {
    const resolved = resolveBinding(ext, binding);
    const sources = binding.sourceIds.map((id) => labels.get(id) ?? id);
    return {
      id: binding.id, subjectId: binding.subjectId, field: binding.target.field, recordId: binding.target.recordId, scenarioId: binding.target.scenarioId,
      state: resolved.state, transform: binding.transform, value: resolved.value, sources, rationale: binding.rationale,
      text: `${binding.target.field} for ${binding.target.recordId} (${binding.target.scenarioId}) = ${JSON.stringify(resolved.value)}; ${resolved.state}; ${binding.transform}; sources: ${sources.join(', ') || 'none'}; ${binding.rationale}`,
    };
  });
}
