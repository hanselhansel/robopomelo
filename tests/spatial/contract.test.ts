import { expect, it } from 'vitest';
import { checkSchema, SPATIAL_CAPABILITY, SPATIAL_NAMESPACE, type PatchEnvelope, type SpatialAction, type Deployment } from '@robopomelo/spec';
import { createBlankProject, evaluatePatch, planningHash, DomainError, validateDeployment, spatialSourceIds } from '@robopomelo/core';
const base = () => createBlankProject({ id: 'project-1', name: 'Spatial', revision: 'rev-1', timestamp: '2026-09-07T00:00:00Z' });
const context = (d: Deployment) => ({ scopes: ['author' as const], nextRevision: 'rev-2', timestamp: '2026-09-07T00:00:01Z', sourceRevision: d.meta.revisionId, sourceHash: 'ab'.repeat(32), toolVersion: 'test', evidence: [] });
const patch = (d: Deployment, actions: SpatialAction[], id = 'change-spatial'): PatchEnvelope => ({
  formatVersion: '1.0.0', id, projectId: d.project.id, baseRevision: d.meta.revisionId, baseHash: 'ab'.repeat(32),
  actor: { kind: 'human', name: 'Engineer' }, purpose: 'Lay out the receiving area', operations: actions.map(action => ({ op: 'spatial', action })),
});
const asset = { id: 'asset-rack-row', version: '1.0.0', sha256: 'a'.repeat(64) };
const known = <T,>(value: T) => ({ state: 'known' as const, value, sourceIds: [] as string[] });
const rack = (id: string, x = 2) => ({ id, asset, pose: { xM: x, yM: 1, zM: 0, yawRad: 0 }, dimensions: known({ lengthM: 12, widthM: 1.2, heightM: 6 }), sourceIds: [] as string[] });
const activate: SpatialAction = { kind: 'activate', capability: SPATIAL_CAPABILITY };
const scene: SpatialAction = { kind: 'define-scene', scene: { id: 'scene-1', name: 'Receiving', floor: known({ lengthM: 60, widthM: 40 }) } };
function withSource(d: Deployment) {
  d.evidence.push({ id: 'evidence-plan', title: 'Floor plan', purpose: 'planning', description: null, ownerId: null, relatedIds: [], sourceEvidenceIds: [], required: false, extensions: {},
    provenance: { state: 'provided', value: 'Site survey' }, location: { kind: 'attachment', path: 'evidence/plan.pdf', sha256: 'b'.repeat(64), size: 10 } } as Deployment['evidence'][number]);
  return d;
}
it('accepts the closed spatial patch wire schema and rejects malformed actions before evaluation', () => {
  const d = base();
  expect(checkSchema(patch(d, [activate, scene, { kind: 'register-asset', asset }, { kind: 'place', sceneId: 'scene-1', instance: rack('rack-1') }]), 'patch')).toEqual([]);
  const bad: unknown[] = [
    { kind: 'place', sceneId: 'scene-1', instance: { ...rack('rack-2'), pose: { xM: 'two', yM: 1, zM: 0, yawRad: 0 } } },
    { kind: 'place', sceneId: 'scene-1', instance: { ...rack('rack-2'), dimensions: known({ lengthM: 0, widthM: 1, heightM: 1 }) } },
    { kind: 'register-asset', asset: { id: 'x', version: '1.0.0', sha256: 'https://example.test/mesh.glb' } },
    { kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 1, yM: 1, zM: 0, yawRad: 0 }, extra: true },
    { kind: 'teleport', id: 'rack-1' },
    { kind: 'activate', capability: 'isaac-sim' },
  ];
  for (const action of bad) expect(checkSchema(patch(d, [action as SpatialAction]), 'patch').length, JSON.stringify(action)).toBeGreaterThan(0);
  expect(checkSchema({ formatVersion: '1.0.0', assets: [], robotProfiles: [], scenes: [], scenarios: [], bindings: [], extra: 1 }, 'spatial').length).toBeGreaterThan(0);
});
it('requires explicit activation in the same mutation before any spatial write and records the capability atomically', () => {
  const d = base();
  expect(() => evaluatePatch(d, patch(d, [scene]), context(d))).toThrow(DomainError);
  const evaluation = evaluatePatch(d, patch(d, [activate, scene, { kind: 'register-asset', asset }, { kind: 'place', sceneId: 'scene-1', instance: rack('rack-1') }]), context(d));
  const capabilities = evaluation.deployment.extensions['robopomelo.capabilities'] as { required: string[] };
  expect(capabilities.required).toContain(SPATIAL_CAPABILITY);
  const spatial = evaluation.deployment.extensions[SPATIAL_NAMESPACE] as { scenes: { instances: unknown[] }[] };
  expect(spatial.scenes[0]!.instances).toHaveLength(1);
  expect(evaluation.diff.filter(row => row.collection.startsWith('spatial.')).map(row => row.collection + ':' + row.id).sort()).toEqual(['spatial.assets:asset-rack-row:1.0.0', 'spatial.instances:rack-1', 'spatial.scenes:scene-1']);
  expect(validateDeployment(evaluation.deployment, context(d)).findings.some(f => f.ruleId === 'RP-090')).toBe(false);
  // A second mutation on an activated project needs no re-activation.
  const next = evaluation.deployment;
  const moved = evaluatePatch(next, { ...patch(next, [{ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 5, yM: 1, zM: 0, yawRad: 1.5708 } }]), baseRevision: next.meta.revisionId }, { ...context(next), nextRevision: 'rev-3' });
  expect((moved.deployment.extensions[SPATIAL_NAMESPACE] as { scenes: { instances: { pose: { xM: number } }[] }[] }).scenes[0]!.instances[0]!.pose.xM).toBe(5);
});
it('rejects unknown assets, duplicate ids, non-finite values and dangling references, and keeps the original untouched', () => {
  const d = base();
  const activated = evaluatePatch(d, patch(d, [activate, scene, { kind: 'register-asset', asset }, { kind: 'place', sceneId: 'scene-1', instance: rack('rack-1') }]), context(d)).deployment;
  const attempt = (actions: SpatialAction[]) => evaluatePatch(activated, patch(activated, actions, 'change-x'), { ...context(activated), nextRevision: 'rev-3' });
  expect(() => attempt([{ kind: 'place', sceneId: 'scene-1', instance: { ...rack('rack-9'), asset: { ...asset, id: 'asset-unknown' } } }])).toThrow(/asset/i);
  expect(() => attempt([{ kind: 'place', sceneId: 'scene-1', instance: rack('rack-1') }])).toThrow(/DUPLICATE|already/i);
  expect(() => attempt([{ kind: 'place', sceneId: 'scene-missing', instance: rack('rack-2') }])).toThrow(/scene/i);
  expect(() => attempt([{ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: Number.NaN, yM: 0, zM: 0, yawRad: 0 } }])).toThrow();
  expect(() => attempt([{ kind: 'place', sceneId: 'scene-1', instance: { ...rack('rack-3'), sourceIds: ['evidence-missing'] } }])).toThrow(/reference|source/i);
  const withStation = attempt([{ kind: 'define-robot-profile', profile: { id: 'robot-diff', drive: 'differential', footprintM: [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]], loadedFootprintM: [[-0.6, -0.4], [0.6, -0.4], [0.6, 0.4], [-0.6, 0.4]], heightM: 1.2, maxSpeedMps: 1.5, maxAngularRadps: 1, accelerationMps2: 0.5, decelerationMps2: 0.8, reverse: false } },
    { kind: 'define-scenario', scenario: { id: 'scenario-1', sceneId: 'scene-1', name: 'Base', robotProfileIds: ['robot-diff'], fleetSize: known(10), stations: [{ id: 'station-1', instanceId: 'rack-1', kind: 'pickup', capacity: 2 }], workload: null, objectives: [] } }]).deployment;
  const later = (actions: SpatialAction[]) => evaluatePatch(withStation, patch(withStation, actions, 'change-y'), { ...context(withStation), nextRevision: 'rev-4' });
  expect(() => later([{ kind: 'remove', sceneId: 'scene-1', id: 'rack-1', replacementId: null }])).toThrow(/station-1|dependent|referenced/i);
  const remapped = later([{ kind: 'place', sceneId: 'scene-1', instance: rack('rack-2', 8) }, { kind: 'remove', sceneId: 'scene-1', id: 'rack-1', replacementId: 'rack-2' }]).deployment;
  const spatial = remapped.extensions[SPATIAL_NAMESPACE] as { scenarios: { stations: { instanceId: string }[] }[]; scenes: { instances: { id: string }[] }[] };
  expect(spatial.scenarios[0]!.stations[0]!.instanceId).toBe('rack-2');
  expect(spatial.scenes[0]!.instances.map(i => i.id)).toEqual(['rack-2']);
  expect((activated.extensions[SPATIAL_NAMESPACE] as { scenes: { instances: unknown[] }[] }).scenes[0]!.instances).toHaveLength(1);
});
it('includes spatial source citations in the planning projection so a cited evidence edit invalidates approval', () => {
  const d = withSource(base());
  const cited = evaluatePatch(d, patch(d, [activate, scene, { kind: 'register-asset', asset }, { kind: 'place', sceneId: 'scene-1', instance: { ...rack('rack-1'), sourceIds: ['evidence-plan'] } }]), context(d)).deployment;
  const before = planningHash(cited);
  const edited = structuredClone(cited);
  (edited.evidence[0]!.location as { sha256: string }).sha256 = 'c'.repeat(64);
  expect(planningHash(edited)).not.toBe(before);
  expect(spatialSourceIds(cited)).toEqual(['evidence-plan']);
  const moved = structuredClone(cited);
  (moved.extensions[SPATIAL_NAMESPACE] as { scenes: { instances: { pose: { xM: number } }[] }[] }).scenes[0]!.instances[0]!.pose.xM = 9;
  expect(planningHash(moved)).not.toBe(before);
});
it('never lets a spatial action reach review, grant or other extension fields', () => {
  const d = base();
  const evaluation = evaluatePatch(d, patch(d, [activate, scene]), context(d));
  expect(evaluation.deployment.review).toEqual(d.review);
  expect(Object.keys(evaluation.deployment.extensions).sort()).toEqual(['robopomelo.capabilities', SPATIAL_NAMESPACE]);
  const declared = { ...patch(d, [activate, scene]), capabilityId: 'frame-robot-deployment' };
  expect(() => evaluatePatch(d, declared, context(d))).toThrow(DomainError);
});
