import { expect, it } from 'vitest';
import { emptySpatialExtension, type RequirementBinding, type SpatialExtension } from '@robopomelo/spec';
import { resolveBinding, invalidateBindings, overrideBinding, explainBindings, affectedScenarios } from '../../packages/spatial/src/bindings.js';
import { convertLength, convertAngle, convertSpeed, convertAcceleration, convertAngularSpeed, UnitError } from '../../packages/spatial/src/units.js';
const known = <T,>(value: T, sourceIds: string[] = []) => ({ state: 'known' as const, value, sourceIds });
function fixture(): SpatialExtension {
  const ext = emptySpatialExtension();
  ext.assets.push({ id: 'asset-rack', version: '1.0.0', sha256: 'a'.repeat(64) });
  ext.robotProfiles.push({ id: 'robot-a', drive: 'differential', footprintM: [[-0.5, -0.4], [0.5, -0.4], [0.5, 0.4], [-0.5, 0.4]], loadedFootprintM: [[-0.7, -0.5], [0.7, -0.5], [0.7, 0.5], [-0.7, 0.5]], heightM: 1.2, maxSpeedMps: 1.5, maxAngularRadps: 1, accelerationMps2: 0.5, decelerationMps2: 0.8, reverse: false });
  ext.scenes.push({ id: 'scene-1', name: 'Receiving', floor: known({ lengthM: 60, widthM: 40 }), instances: [
    { id: 'rack-1', asset: ext.assets[0]!, pose: { xM: 0, yM: 0, zM: 0, yawRad: 0 }, dimensions: known({ lengthM: 12, widthM: 1.2, heightM: 6 }, ['evidence-plan']), sourceIds: ['evidence-plan'] },
  ] });
  ext.scenarios.push({ id: 'scenario-1', sceneId: 'scene-1', name: 'Base', robotProfileIds: ['robot-a'], fleetSize: known(10, ['evidence-brief']), stations: [], workload: { seed: 7, jobs: 500, arrivalsPerHour: 120, mix: [] }, objectives: [{ id: 'objective-throughput', kind: 'throughput', direction: 'maximize', threshold: 110, unit: 'pallets/h', sourceIds: ['evidence-kpi'] }] });
  ext.bindings.push(
    { id: 'binding-rack', subjectId: 'requirement-rack', sourceIds: ['evidence-plan'], target: { scenarioId: 'scenario-1', recordId: 'rack-1', field: 'instance.dimensions' }, transform: 'unit-conversion', rationale: 'Plan states 1200 cm rack rows.', knowledgeState: 'known', confirmedAtRevision: 'rev-3' },
    { id: 'binding-fleet', subjectId: 'need-throughput', sourceIds: ['evidence-brief'], target: { scenarioId: 'scenario-1', recordId: 'scenario-1', field: 'scenario.fleetSize' }, transform: 'assumption', rationale: 'Brief mentions about ten robots.', knowledgeState: 'unverified', confirmedAtRevision: 'rev-3' },
    { id: 'binding-arrivals', subjectId: 'kpi-throughput', sourceIds: ['evidence-kpi'], target: { scenarioId: 'scenario-1', recordId: 'scenario-1', field: 'workload.arrivalsPerHour' }, transform: 'identity', rationale: 'KPI baseline arrivals.', knowledgeState: 'known', confirmedAtRevision: 'rev-3' },
  );
  return ext;
}
it('resolves each binding to its current field value with explicit transform and knowledge state', () => {
  const ext = fixture();
  expect(resolveBinding(ext, ext.bindings[0]!)).toMatchObject({ state: 'known', transform: 'unit-conversion', value: { lengthM: 12, widthM: 1.2, heightM: 6 } });
  expect(resolveBinding(ext, ext.bindings[1]!)).toMatchObject({ state: 'unverified', value: 10 });
  expect(resolveBinding(ext, ext.bindings[2]!)).toMatchObject({ state: 'known', value: 120 });
  const missing: RequirementBinding = { ...ext.bindings[0]!, id: 'binding-gone', target: { ...ext.bindings[0]!.target, recordId: 'rack-9' } };
  expect(resolveBinding(ext, missing)).toMatchObject({ state: 'unresolved', value: null });
  expect(resolveBinding(ext, missing).explanation).toMatch(/rack-9/);
});
it('marks only bindings citing a corrected source as stale and reports only the affected scenarios', () => {
  const ext = fixture();
  ext.scenarios.push({ ...ext.scenarios[0]!, id: 'scenario-2', objectives: [] });
  ext.bindings.push({ ...ext.bindings[2]!, id: 'binding-arrivals-2', target: { ...ext.bindings[2]!.target, scenarioId: 'scenario-2' } });
  const next = invalidateBindings(ext.bindings, ['evidence-brief']);
  expect(next.map(b => [b.id, b.knowledgeState])).toEqual([
    ['binding-rack', 'known'], ['binding-fleet', 'stale'], ['binding-arrivals', 'known'], ['binding-arrivals-2', 'known'],
  ]);
  expect(next[0]).toBe(ext.bindings[0]);
  expect(affectedScenarios(next.filter(b => b.knowledgeState === 'stale'))).toEqual(['scenario-1']);
  expect(affectedScenarios(invalidateBindings(ext.bindings, ['evidence-kpi']).filter(b => b.knowledgeState === 'stale'))).toEqual(['scenario-1', 'scenario-2']);
  expect(invalidateBindings(ext.bindings, ['evidence-unrelated'])).toEqual(ext.bindings);
});
it('overrides create a new assumed binding that keeps the provenance chain instead of erasing it', () => {
  const ext = fixture();
  const replaced = overrideBinding(ext.bindings[1]!, { id: 'binding-fleet-2', rationale: 'Operator confirmed 12 robots on the call.', revision: 'rev-5', sourceIds: ['evidence-call'] });
  expect(replaced).toMatchObject({ id: 'binding-fleet-2', transform: 'assumption', knowledgeState: 'assumed', confirmedAtRevision: 'rev-5', target: ext.bindings[1]!.target });
  expect(replaced.sourceIds).toEqual(['evidence-call', 'evidence-brief']);
  expect(replaced.rationale).toContain('Operator confirmed 12 robots');
  expect(replaced.rationale).toContain('binding-fleet');
  expect(() => overrideBinding(ext.bindings[1]!, { id: 'binding-fleet-2', rationale: '', revision: 'rev-5', sourceIds: [] })).toThrow(/rationale/i);
});
it('explains bindings readably for an engineering handoff, including unresolved and stale ones', () => {
  const ext = fixture();
  const stale = invalidateBindings(ext.bindings, ['evidence-brief']);
  const rows = explainBindings({ ...ext, bindings: stale }, new Map([['evidence-plan', 'Floor plan.pdf'], ['evidence-brief', 'initial-brief.txt']]));
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({ id: 'binding-rack', field: 'instance.dimensions', state: 'known', sources: ['Floor plan.pdf'] });
  expect(rows[1]).toMatchObject({ id: 'binding-fleet', state: 'stale', sources: ['initial-brief.txt'] });
  expect(rows[2]!.sources).toEqual(['evidence-kpi']);
  for (const row of rows) expect(typeof row.text).toBe('string');
  expect(rows[1]!.text).toMatch(/stale/i);
});
it('converts geometric units explicitly and refuses to guess unknown vendor units', () => {
  expect(convertLength(1200, 'cm', 'm')).toBe(12);
  expect(convertLength(1.2, 'm', 'mm')).toBeCloseTo(1200, 9);
  expect(convertLength(10, 'ft', 'm')).toBeCloseTo(3.048, 9);
  expect(convertAngle(90, 'deg', 'rad')).toBeCloseTo(Math.PI / 2, 12);
  expect(convertAngle(Math.PI, 'rad', 'deg')).toBeCloseTo(180, 12);
  expect(convertSpeed(3.6, 'km/h', 'm/s')).toBeCloseTo(1, 12);
  expect(convertSpeed(2, 'm/s', 'ft/s')).toBeCloseTo(6.5616797900, 6);
  expect(convertAcceleration(100, 'cm/s^2', 'm/s^2')).toBeCloseTo(1, 12);
  expect(convertAngularSpeed(180, 'deg/s', 'rad/s')).toBeCloseTo(Math.PI, 12);
  expect(convertAngularSpeed(60, 'rpm', 'rad/s')).toBeCloseTo(2 * Math.PI, 12);
  for (const call of [() => convertLength(1, 'units' as 'm', 'm'), () => convertLength(1, 'm', 'yd' as 'm'), () => convertSpeed(1, 'mph' as 'm/s', 'm/s'), () => convertLength(Number.NaN, 'm', 'm'), () => convertLength(Number.POSITIVE_INFINITY, 'm', 'cm')])
    expect(call).toThrow(UnitError);
});
