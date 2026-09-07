import { describe, expect, it } from 'vitest';
import { bundledCatalog } from '../../packages/spatial/src/catalog.js';
import { RACK_ROW_RECIPE, RECIPE_LIMITS, compileRecipe, validateRecipe, type AssemblyRecipe, type RecipeNode } from '../../packages/spatial/src/assembly.js';
import { STATION_QUEUE_BEHAVIOR, compatibleWith, validateBehavior } from '../../packages/spatial/src/behavior.js';
import { RECEIVING_TO_STAGING_TEMPLATE, instantiateTemplate, validateTemplate } from '../../packages/spatial/src/template.js';
import { newDraft, promote, validateDraft, type AssetDraft } from '../../packages/spatial/src/draft.js';
import { hashJson } from '../../packages/spatial/src/hash.js';
const catalog = bundledCatalog();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const failsWith = (fn: () => unknown, code: string) => expect(fn).toThrow(expect.objectContaining({ code }));
const bay = (x: number): RecipeNode => ({ kind: 'transform', pose: { xM: x, yM: 0, zM: 0, yawRad: 0 }, child: { kind: 'catalog-ref', id: 'rack-bay', version: '1.0.0', params: {} } });
const recipe = (root: RecipeNode, extra: Partial<AssemblyRecipe> = {}): AssemblyRecipe => ({ id: 'test-assembly', version: '1.0.0', title: 'Test', subAssemblies: {}, root, ...extra });
describe('assembly recipes', () => {
  it('validates and compiles the rack-row fixture from rack-bay references with nested component ids', () => {
    const valid = validateRecipe(RACK_ROW_RECIPE, catalog);
    const compiled = compileRecipe(valid, catalog);
    expect(compiled.collision).toHaveLength(4);
    expect(compiled.display).toHaveLength(4);
    expect(compiled.componentIds).toEqual(['bay-1/bay', 'bay-2/bay', 'bay-3/bay', 'bay-4/bay']);
    expect(compiled.bounds.maxX - compiled.bounds.minX).toBeCloseTo(10.8, 6);
    expect(compiled.collision[0]!.zMaxM).toBeCloseTo(6, 6);
    expect(compiled.display[0]!.materialId).toBe('steel-green');
  });
  it('rejects duplicate or malformed component ids', () => {
    failsWith(() => validateRecipe(recipe({ kind: 'group', children: [{ ...bay(0), componentId: 'a' }, { ...bay(3), componentId: 'a' }] }), catalog), 'RECIPE_DUPLICATE_ID');
    failsWith(() => validateRecipe(recipe({ ...bay(0), componentId: 'Bad Id' }), catalog), 'RECIPE_INVALID');
  });
  it('rejects unknown catalog references and out-of-range or unknown parameters', () => {
    failsWith(() => validateRecipe(recipe({ kind: 'catalog-ref', id: 'conveyor', version: '1.0.0', params: {} }), catalog), 'ASSET_UNKNOWN');
    failsWith(() => validateRecipe(recipe({ kind: 'catalog-ref', id: 'rack-bay', version: '1.0.0', params: { lengthM: 99 } }), catalog), 'PARAMETER_OUT_OF_RANGE');
    failsWith(() => validateRecipe(recipe({ kind: 'catalog-ref', id: 'rack-bay', version: '1.0.0', params: { color: 1 } }), catalog), 'PARAMETER_UNKNOWN');
  });
  it('accepts convex extrusions and rejects non-convex or oversized polygons', () => {
    const ok = validateRecipe(recipe({ kind: 'extrusion', polygon: [[0, 0], [2, 0], [2, 1], [0, 1]], heightM: 0.5, materialId: 'concrete' }), catalog);
    const compiled = compileRecipe(ok, catalog);
    expect(compiled.collision[0]).toMatchObject({ zMinM: 0, zMaxM: 0.5 });
    expect(compiled.display[0]).toMatchObject({ primitive: 'extrusion', materialId: 'concrete' });
    failsWith(() => validateRecipe(recipe({ kind: 'extrusion', polygon: [[0, 0], [2, 0], [1, 0.2], [2, 1], [0, 1]], heightM: 0.5, materialId: 'concrete' }), catalog), 'COLLISION_NONCONVEX');
    const many = Array.from({ length: 33 }, (_, i) => [Math.cos((i / 33) * Math.PI * 2), Math.sin((i / 33) * Math.PI * 2)] as [number, number]);
    failsWith(() => validateRecipe(recipe({ kind: 'extrusion', polygon: many, heightM: 0.5, materialId: 'concrete' }), catalog), 'RECIPE_INVALID');
    failsWith(() => validateRecipe(recipe({ kind: 'extrusion', polygon: [[0, 0], [2, 0], [2, 1], [0, 1]], heightM: 0, materialId: 'concrete' }), catalog), 'PARAMETER_OUT_OF_RANGE');
  });
  it('rejects explicit sub-assembly cycles and unknown sub-assembly names', () => {
    const cyclic = recipe({ kind: 'sub-assembly', name: 'a' }, { subAssemblies: { a: { kind: 'group', children: [bay(0), { kind: 'sub-assembly', name: 'b' }] }, b: { kind: 'transform', pose: { xM: 1, yM: 0, zM: 0, yawRad: 0 }, child: { kind: 'sub-assembly', name: 'a' } } } });
    failsWith(() => validateRecipe(cyclic, catalog), 'RECIPE_CYCLE');
    failsWith(() => validateRecipe(recipe({ kind: 'sub-assembly', name: 'a' }, { subAssemblies: { a: { kind: 'sub-assembly', name: 'a' } } }), catalog), 'RECIPE_CYCLE');
    failsWith(() => validateRecipe(recipe({ kind: 'sub-assembly', name: 'missing' }), catalog), 'RECIPE_INVALID');
  });
  it('rejects scripts, URLs and unsupported node kinds anywhere in the recipe', () => {
    failsWith(() => validateRecipe(recipe({ kind: 'extrusion', polygon: [[0, 0], [2, 0], [2, 1], [0, 1]], heightM: 0.5, materialId: 'https://example.com/tex.png' }), catalog), 'ASSET_UNSAFE');
    failsWith(() => validateRecipe(recipe(bay(0), { title: '<script>alert(1)</script>' }), catalog), 'ASSET_UNSAFE');
    failsWith(() => validateRecipe({ ...recipe(bay(0)), src: 'x' } as unknown as AssemblyRecipe, catalog), 'ASSET_UNSAFE');
    failsWith(() => validateRecipe(recipe({ kind: 'mesh', url: 'x' } as unknown as RecipeNode), catalog), 'ASSET_UNSAFE');
    failsWith(() => validateRecipe(recipe({ kind: 'script', code: 'x' } as unknown as RecipeNode), catalog), 'RECIPE_UNSUPPORTED');
  });
  it('enforces node, depth and vertex limits', () => {
    expect(RECIPE_LIMITS).toEqual({ nodes: 200, depth: 8, vertices: 2000 });
    failsWith(() => validateRecipe(recipe({ kind: 'group', children: Array.from({ length: 200 }, (_, i) => bay(i)) }), catalog), 'RECIPE_TOO_LARGE');
    let deep: RecipeNode = bay(0);
    for (let i = 0; i < 8; i++) deep = { kind: 'group', children: [deep] };
    failsWith(() => validateRecipe(recipe(deep), catalog), 'RECIPE_TOO_DEEP');
    const square = (i: number): RecipeNode => ({ kind: 'extrusion', polygon: Array.from({ length: 32 }, (_, k) => [i * 3 + Math.cos((k / 32) * Math.PI * 2), Math.sin((k / 32) * Math.PI * 2)]), heightM: 0.2, materialId: 'concrete' });
    failsWith(() => validateRecipe(recipe({ kind: 'group', children: Array.from({ length: 63 }, (_, i) => square(i)) }), catalog), 'RECIPE_TOO_MANY_VERTICES');
    const expanded = recipe({ kind: 'group', children: Array.from({ length: 10 }, () => ({ kind: 'sub-assembly', name: 'row' })) }, { subAssemblies: { row: { kind: 'group', children: Array.from({ length: 20 }, (_, i) => bay(i)) } } });
    failsWith(() => validateRecipe(expanded, catalog), 'RECIPE_TOO_LARGE');
  });
});
describe('behavior profiles', () => {
  it('validates the station queue fixture and its compatibility with station kinds', () => {
    const behavior = validateBehavior(STATION_QUEUE_BEHAVIOR);
    expect(behavior).toMatchObject({ kind: 'station-queue', queueCapacity: 3, approach: 'front' });
    expect(compatibleWith(behavior, 'pickup')).toBe(true);
    expect(compatibleWith(behavior, 'dropoff')).toBe(true);
    expect(compatibleWith(behavior, 'charger')).toBe(false);
  });
  it('rejects out-of-bounds values, unknown kinds and unsafe text', () => {
    failsWith(() => validateBehavior({ ...STATION_QUEUE_BEHAVIOR, queueCapacity: 0 }), 'PARAMETER_OUT_OF_RANGE');
    failsWith(() => validateBehavior({ ...STATION_QUEUE_BEHAVIOR, dwellSeconds: { load: 20, unload: 90_000 } }), 'PARAMETER_OUT_OF_RANGE');
    failsWith(() => validateBehavior({ ...STATION_QUEUE_BEHAVIOR, approach: 'above' }), 'BEHAVIOR_INVALID');
    failsWith(() => validateBehavior({ ...STATION_QUEUE_BEHAVIOR, kind: 'script' }), 'BEHAVIOR_UNSUPPORTED');
    failsWith(() => validateBehavior({ ...STATION_QUEUE_BEHAVIOR, onload: 'x' }), 'ASSET_UNSAFE');
  });
});
describe('scenario templates', () => {
  const ids = () => { let n = 0; return () => `id-${++n}`; };
  const context = () => ({ catalog, behaviors: [validateBehavior(STATION_QUEUE_BEHAVIOR)], ids: ids() });
  it('instantiates the receiving-to-staging fixture into spatial actions with bounded overrides', () => {
    validateTemplate(RECEIVING_TO_STAGING_TEMPLATE);
    const actions = instantiateTemplate(RECEIVING_TO_STAGING_TEMPLATE, { arrivalsPerHour: 90, fleetSize: 6 }, context());
    expect(actions.map((a) => a.kind)).toEqual(['define-scene', 'register-asset', 'register-asset', 'register-asset', 'place', 'place', 'place', 'place', 'define-scenario']);
    const scenario = actions.find((a) => a.kind === 'define-scenario')!;
    if (scenario.kind !== 'define-scenario') throw new Error('unreachable');
    expect(scenario.scenario.workload).toMatchObject({ arrivalsPerHour: 90, jobs: RECEIVING_TO_STAGING_TEMPLATE.workloadDefaults.jobs });
    expect(scenario.scenario.fleetSize).toEqual({ state: 'unverified', value: 6, sourceIds: [] });
    expect(scenario.scenario.stations.map((s) => s.kind)).toEqual(['pickup', 'dropoff']);
    expect(scenario.scenario.id).toBe('id-2');
    const register = actions[1]!;
    if (register.kind !== 'register-asset') throw new Error('unreachable');
    expect(register.asset.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects unknown override keys and out-of-bounds values', () => {
    failsWith(() => instantiateTemplate(RECEIVING_TO_STAGING_TEMPLATE, { lanes: 3 }, context()), 'PARAMETER_UNKNOWN');
    failsWith(() => instantiateTemplate(RECEIVING_TO_STAGING_TEMPLATE, { arrivalsPerHour: 100_000 }, context()), 'PARAMETER_OUT_OF_RANGE');
    failsWith(() => instantiateTemplate(RECEIVING_TO_STAGING_TEMPLATE, { fleetSize: 2.5 }, context()), 'PARAMETER_OUT_OF_RANGE');
  });
  it('rejects incompatible station behaviors and unknown behavior references', () => {
    const t = clone(RECEIVING_TO_STAGING_TEMPLATE);
    t.stations[0]!.kind = 'charger';
    failsWith(() => instantiateTemplate(t, {}, context()), 'BEHAVIOR_INCOMPATIBLE');
    const u = clone(RECEIVING_TO_STAGING_TEMPLATE);
    u.stations[0]!.behavior = { id: 'nope', version: '1.0.0' };
    failsWith(() => instantiateTemplate(u, {}, context()), 'ASSET_UNKNOWN');
    failsWith(() => validateTemplate({ ...RECEIVING_TO_STAGING_TEMPLATE, parameters: { ...RECEIVING_TO_STAGING_TEMPLATE.parameters, lanes: { type: 'number', minimum: 1, maximum: 4, default: 2, description: 'x' } } }), 'TEMPLATE_INVALID');
  });
});
describe('draft lifecycle', () => {
  const clock = () => '2026-09-08T00:00:00.000Z';
  const ctx = { catalog, behaviors: [validateBehavior(STATION_QUEUE_BEHAVIOR)] };
  it('leaves a failing draft visibly incomplete and refuses promotion', () => {
    const draft = validateDraft(newDraft('d1', 'assembly', recipe({ kind: 'catalog-ref', id: 'conveyor', version: '1.0.0', params: {} })), ctx);
    expect(draft.status).toBe('draft');
    expect(draft.validation.ok).toBe(false);
    expect(draft.validation.findings[0]).toMatchObject({ code: 'ASSET_UNKNOWN' });
    failsWith(() => promote(draft, { version: '1.0.0', clock }), 'DRAFT_NOT_VALIDATED');
  });
  it('promotes a validated draft to an immutable record, idempotently for the same content', () => {
    const draft = validateDraft(newDraft('rack-row-custom', 'assembly', RACK_ROW_RECIPE), ctx);
    expect(draft.status).toBe('validated');
    failsWith(() => promote(draft, { version: 'v1', clock }), 'VERSION_INVALID');
    const first = promote(draft, { version: '1.0.0', clock });
    expect(first.record.ref).toEqual({ id: 'rack-row-custom', version: '1.0.0', sha256: hashJson({ kind: 'assembly', content: first.record.content }) });
    expect(first.record.createdAt).toBe(clock());
    expect(first.draft).toMatchObject({ status: 'reusable-version', version: '1.0.0', promotedTo: first.record.ref });
    expect(Object.isFrozen(first.record)).toBe(true);
    const again = promote(draft, { version: '1.0.0', clock: () => '2026-09-09T00:00:00.000Z', existing: first.record });
    expect(again.record).toBe(first.record);
  });
  it('requires a new version for different content at an existing version and never mutates the referenced version', () => {
    const base = validateDraft(newDraft('rack-row-custom', 'assembly', RACK_ROW_RECIPE), ctx);
    const first = promote(base, { version: '1.0.0', clock });
    const changed = clone(RACK_ROW_RECIPE);
    changed.title = 'Rack row, taller';
    const next = validateDraft(newDraft('rack-row-custom', 'assembly', changed), ctx);
    failsWith(() => promote(next, { version: '1.0.0', clock, existing: first.record }), 'VERSION_REQUIRED');
    const second = promote(next, { version: '1.1.0', clock, existing: first.record });
    expect(second.record.ref.version).toBe('1.1.0');
    expect(second.record.ref.sha256).not.toBe(first.record.ref.sha256);
    expect(first.record.ref.version).toBe('1.0.0');
  });
  it('validates behavior, template and object drafts through the same lifecycle', () => {
    expect(validateDraft(newDraft('b', 'behavior', STATION_QUEUE_BEHAVIOR), ctx).status).toBe('validated');
    expect(validateDraft(newDraft('t', 'template', RECEIVING_TO_STAGING_TEMPLATE), ctx).status).toBe('validated');
    const { sha256: _ignored, ...entry } = catalog.entries.find((e) => e.id === 'pallet')!;
    expect(validateDraft(newDraft('o', 'object', entry), ctx).status).toBe('validated');
    const bad = validateDraft(newDraft('b2', 'behavior', { ...STATION_QUEUE_BEHAVIOR, queueCapacity: 0 }), ctx);
    expect(bad).toMatchObject({ status: 'draft', validation: { ok: false, findings: [{ code: 'PARAMETER_OUT_OF_RANGE' }] } });
    const stale: AssetDraft = { ...bad, status: 'validated' };
    failsWith(() => promote(stale, { version: '1.0.0', clock }), 'DRAFT_NOT_VALIDATED');
  });
});
