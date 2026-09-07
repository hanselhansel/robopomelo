import { describe, expect, it } from 'vitest';
import type { Instance, Scene } from '@robopomelo/spec';
import { assetRefFor, bundledCatalog, catalogEntry, type CatalogEntry } from '../../packages/spatial/src/catalog.js';
import { compileScene, INSTANCE_LIMIT } from '../../packages/spatial/src/compile.js';
import { area, bounds, containsPolygon, extentsFor, footprintFor, heightIntervalFor, isConvex, isSimple, resolveParameters, transformPolygon, type Polygon } from '../../packages/spatial/src/geometry.js';
import { hashJson } from '../../packages/spatial/src/hash.js';
const catalog = bundledCatalog();
const entry = (id: string) => catalogEntry(catalog, id, '1.0.0');
const square: Polygon = [[0, 0], [1, 0], [1, 1], [0, 1]];
const closeTo = (actual: Polygon, expected: Polygon, digits = 12) => { expect(actual).toHaveLength(expected.length); actual.forEach((p, i) => { expect(p[0]).toBeCloseTo(expected[i]![0], digits); expect(p[1]).toBeCloseTo(expected[i]![1], digits); }); };
describe('convex polygon utilities', () => {
  it('classifies convexity in either orientation and rejects degenerate shapes', () => {
    expect(isConvex(square)).toBe(true);
    expect(isConvex([...square].reverse())).toBe(true);
    expect(isConvex([[0, 0], [2, 0], [2, 2], [1, 0.5], [0, 2]])).toBe(false);
    expect(isConvex([[0, 0], [1, 0], [2, 0]])).toBe(false);
    expect(isConvex([[0, 0], [1, 0], [2, 0], [2, 1], [0, 1]])).toBe(true);
    expect(isConvex([[0, 0], [1, 0]])).toBe(false);
    expect(isConvex([[0, 0], [Number.NaN, 0], [1, 1]])).toBe(false);
  });
  it('detects self-intersection and repeated vertices', () => {
    expect(isSimple(square)).toBe(true);
    expect(isSimple([[0, 0], [1, 1], [1, 0], [0, 1]])).toBe(false);
    expect(isSimple([[0, 0], [1, 0], [1, 1], [1, 0]])).toBe(false);
    expect(isSimple([[0, 0], [2, 0], [2, 2], [1, 0.5], [0, 2]])).toBe(true);
  });
  it('measures area and bounds', () => {
    expect(area(square)).toBe(1);
    expect(area([...square].reverse())).toBe(1);
    expect(bounds([[-1, -2], [3, -2], [3, 4], [-1, 4]])).toEqual({ minX: -1, minY: -2, maxX: 3, maxY: 4 });
    expect(() => bounds([[0, 0], [1, 1]])).toThrow(expect.objectContaining({ code: 'POLYGON_INVALID' }));
    expect(containsPolygon([[-1, -1], [1, -1], [1, 1], [-1, 1]], square)).toBe(true);
    expect(containsPolygon(square, [[-1, -1], [1, -1], [1, 1], [-1, 1]])).toBe(false);
  });
  it('transforms right-handed Z-up with yaw about +Z: (1,0) rotated by pi/2 lands at (0,1)', () => {
    const [p] = transformPolygon([[1, 0], [0, 0], [0, 1]], { xM: 0, yM: 0, zM: 0, yawRad: Math.PI / 2 });
    expect(Math.abs(p![0] - 0)).toBeLessThan(1e-12);
    expect(Math.abs(p![1] - 1)).toBeLessThan(1e-12);
    closeTo(transformPolygon(square, { xM: 10, yM: -5, zM: 2, yawRad: Math.PI }), [[10, -5], [9, -5], [9, -6], [10, -6]]);
    expect(() => transformPolygon(square, { xM: Number.POSITIVE_INFINITY, yM: 0, zM: 0, yawRad: 0 })).toThrow(expect.objectContaining({ code: 'POSE_INVALID' }));
  });
});
describe('catalog-driven footprints', () => {
  it('derives extents and box footprints from parameters with defaults filled in', () => {
    expect(extentsFor(entry('rack-row'))).toEqual({ lengthM: 10.8, widthM: 1.1, heightM: 6 });
    expect(extentsFor(entry('rack-row'), { lengthM: 20, bays: 8 })).toEqual({ lengthM: 20, widthM: 1.1, heightM: 6 });
    expect(footprintFor(entry('rack-row'), { lengthM: 20 })).toEqual([[-10, -0.55], [10, -0.55], [10, 0.55], [-10, 0.55]]);
    expect(resolveParameters(entry('rack-row'), { bays: 8 })).toEqual({ lengthM: 10.8, widthM: 1.1, heightM: 6, bays: 8 });
    expect(heightIntervalFor(entry('door-opening'), { clearanceM: 2, heightM: 5 })).toEqual({ zMinM: 2, zMaxM: 5 });
    expect(heightIntervalFor(entry('pallet'))).toEqual({ zMinM: 0, zMaxM: 1.2 });
  });
  it('rejects unknown and out-of-range parameters', () => {
    expect(() => footprintFor(entry('pallet'), { depthM: 1 })).toThrow(expect.objectContaining({ code: 'PARAMETER_UNKNOWN' }));
    expect(() => footprintFor(entry('pallet'), { lengthM: 99 })).toThrow(expect.objectContaining({ code: 'PARAMETER_OUT_OF_RANGE' }));
    expect(() => footprintFor(entry('pallet'), { lengthM: -1 })).toThrow(expect.objectContaining({ code: 'PARAMETER_OUT_OF_RANGE' }));
    expect(() => extentsFor(entry('pallet'), { heightM: Number.NaN })).toThrow(expect.objectContaining({ code: 'PARAMETER_OUT_OF_RANGE' }));
    expect(() => heightIntervalFor(entry('door-opening'), { clearanceM: 6, heightM: 5 })).toThrow(expect.objectContaining({ code: 'PARAMETER_OUT_OF_RANGE' }));
  });
  it('scales robot body and loaded polygons with dimensions and keeps the loaded footprint larger than the body', () => {
    const robot = entry('robot-differential');
    closeTo(footprintFor(robot), [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]]);
    closeTo(footprintFor(robot, {}, { loaded: true }), [[-0.5, -0.35], [0.5, -0.35], [0.5, 0.35], [-0.5, 0.35]]);
    closeTo(footprintFor(robot, { lengthM: 1.6, widthM: 1.2 }), [[-0.8, -0.6], [0.8, -0.6], [0.8, 0.6], [-0.8, 0.6]]);
    expect(area(footprintFor(robot, {}, { loaded: true }))).toBeGreaterThan(area(footprintFor(robot)));
    expect(containsPolygon(footprintFor(robot, { lengthM: 1.6 }, { loaded: true }), footprintFor(robot, { lengthM: 1.6 }))).toBe(true);
    expect(() => footprintFor(entry('pallet'), {}, { loaded: true })).toThrow(expect.objectContaining({ code: 'LOADED_FOOTPRINT_UNSUPPORTED' }));
  });
  it('keeps the collision footprint independent of display definition', () => {
    const column = entry('column');
    const decorated: CatalogEntry = { ...column, display: { primitive: 'extrusion', materialId: 'ornate' }, exportProfiles: { isaac: { usdPrimType: 'Xform', notes: 'decorative mesh' } } };
    expect(footprintFor(decorated, { lengthM: 0.6, widthM: 0.4 })).toEqual(footprintFor(column, { lengthM: 0.6, widthM: 0.4 }));
    expect(footprintFor(decorated, { lengthM: 0.6, widthM: 0.4 })).toEqual([[-0.3, -0.2], [0.3, -0.2], [0.3, 0.2], [-0.3, 0.2]]);
  });
});
const known = <T,>(value: T) => ({ state: 'known' as const, value, sourceIds: ['evidence-plan'] });
const instance = (id: string, assetId: string, pose: Partial<Instance['pose']> = {}, dimensions: Instance['dimensions'] = { state: 'unknown', reason: 'not surveyed' }): Instance =>
  ({ id, asset: assetRefFor(entry(assetId)), pose: { xM: 0, yM: 0, zM: 0, yawRad: 0, ...pose }, dimensions, sourceIds: [] });
const scene = (...instances: Instance[]): Scene => ({ id: 'scene-1', name: 'Receiving', floor: known({ lengthM: 60, widthM: 40 }), instances });
describe('scene compilation', () => {
  it('orders objects by instance id, hashes the canonical scene and freezes the output', () => {
    const compiled = compileScene(scene(instance('rack-b', 'rack-row'), instance('rack-a', 'pallet'), instance('rack-c', 'column')), catalog);
    expect(compiled.objects.map((o) => o.instanceId)).toEqual(['rack-a', 'rack-b', 'rack-c']);
    expect(compiled.sceneId).toBe('scene-1');
    expect(compiled.sourceHash).toBe(hashJson(scene(instance('rack-b', 'rack-row'), instance('rack-a', 'pallet'), instance('rack-c', 'column'))));
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.objects[0]!.collision.polygon)).toBe(true);
    const again = compileScene(scene(instance('rack-c', 'column'), instance('rack-a', 'pallet'), instance('rack-b', 'rack-row')), catalog);
    expect(again.objects).toEqual(compiled.objects);
  });
  it('rejects unknown assets, hash mismatches, duplicates, bad poses and oversized scenes', () => {
    const rejects = (s: Scene, code: string) => expect(() => compileScene(s, catalog)).toThrow(expect.objectContaining({ code }));
    rejects(scene({ ...instance('x', 'pallet'), asset: { id: 'conveyor', version: '1.0.0', sha256: 'a'.repeat(64) } }), 'ASSET_UNKNOWN');
    rejects(scene({ ...instance('x', 'pallet'), asset: { ...assetRefFor(entry('pallet')), version: '9.0.0' } }), 'ASSET_UNKNOWN');
    rejects(scene({ ...instance('x', 'pallet'), asset: { ...assetRefFor(entry('pallet')), sha256: 'b'.repeat(64) } }), 'ASSET_HASH_MISMATCH');
    rejects(scene(instance('x', 'pallet'), instance('x', 'column')), 'INSTANCE_DUPLICATE');
    rejects(scene(instance('x', 'pallet', { yawRad: Number.NaN })), 'POSE_INVALID');
    rejects(scene(instance('x', 'pallet', {}, known({ lengthM: 0, widthM: 1, heightM: 1 }))), 'PARAMETER_OUT_OF_RANGE');
    rejects(scene(instance('x', 'pallet', {}, known({ lengthM: 50, widthM: 1, heightM: 1 }))), 'PARAMETER_OUT_OF_RANGE');
    expect(() => compileScene(scene(...Array.from({ length: 3 }, (_, i) => instance(`p${i}`, 'pallet'))), catalog, { instanceLimit: 2 })).toThrow(expect.objectContaining({ code: 'SCENE_TOO_LARGE' }));
    expect(INSTANCE_LIMIT).toBe(5000);
  });
  it('marks unknown dimensions as estimated using catalog defaults, and keeps known and unverified states', () => {
    const compiled = compileScene(scene(
      instance('a', 'pallet'),
      instance('b', 'pallet', {}, known({ lengthM: 1, widthM: 1, heightM: 2 })),
      instance('c', 'pallet', {}, { state: 'unverified', value: { lengthM: 1.5, widthM: 1, heightM: 1 }, sourceIds: [] }),
      instance('d', 'pallet', {}, { state: 'not-applicable', reason: 'marker only' }),
    ), catalog);
    expect(compiled.objects.map((o) => o.dimensionState)).toEqual(['estimated', 'known', 'unverified', 'estimated']);
    expect(compiled.objects[0]!.display.sizeM).toEqual({ lengthM: 1.2, widthM: 0.8, heightM: 1.2 });
    expect(compiled.objects[1]!.display.sizeM).toEqual({ lengthM: 1, widthM: 1, heightM: 2 });
    expect(compiled.objects[1]!.collision).toEqual({ polygon: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], zMinM: 0, zMaxM: 2 });
  });
  it('places a rotated rack row in world meters and lifts door headers above their clearance', () => {
    const compiled = compileScene(scene(
      instance('rack', 'rack-row', { xM: 10, yM: 5, yawRad: Math.PI / 2 }, known({ lengthM: 8, widthM: 1, heightM: 6 })),
      instance('door', 'door-opening', { xM: 0, yM: 0, zM: 0.5 }),
    ), catalog);
    const rack = compiled.objects.find((o) => o.instanceId === 'rack')!;
    closeTo(rack.collision.polygon, [[10.5, 1], [10.5, 9], [9.5, 9], [9.5, 1]]);
    expect(rack.collision).toMatchObject({ zMinM: 0, zMaxM: 6 });
    expect(rack.display.pose).toEqual({ xM: 10, yM: 5, zM: 0, yawRad: Math.PI / 2 });
    expect(rack.assetId).toBe('rack-row');
    const door = compiled.objects.find((o) => o.instanceId === 'door')!;
    expect(door.collision).toMatchObject({ zMinM: 2.9, zMaxM: 6.5 });
  });
  it('preserves robot drive-origin and load offsets and emits a loaded collision larger than the display body', () => {
    const compiled = compileScene(scene(instance('robot-1', 'robot-differential', { xM: 2, yM: 3 })), catalog);
    const robot = compiled.objects[0]!;
    expect(robot.driveOriginOffsetM).toEqual([0, 0]);
    expect(robot.loadOffsetM).toEqual([0.1, 0]);
    expect(robot.display.sizeM).toEqual({ lengthM: 0.8, widthM: 0.6, heightM: 0.4 });
    closeTo(robot.loadedCollision!.polygon, [[1.5, 2.65], [2.5, 2.65], [2.5, 3.35], [1.5, 3.35]]);
    expect(area(robot.loadedCollision!.polygon)).toBeGreaterThan(robot.display.sizeM.lengthM * robot.display.sizeM.widthM);
    expect(compileScene(scene(instance('p', 'pallet')), catalog).objects[0]).not.toHaveProperty('loadedCollision');
  });
});
