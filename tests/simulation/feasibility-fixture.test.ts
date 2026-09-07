import { expect, it } from 'vitest';
import { checkSchema, type SpatialExtension } from '@robopomelo/spec';
import fixture from '../../fixtures/fleet-50.json';
const spatial = fixture.spatial as unknown as SpatialExtension;
const box = (i: { pose: { xM: number; yM: number }; dimensions: { state: string; value?: { lengthM: number; widthM: number } } }) => {
  const v = i.dimensions.value!;
  return { x0: i.pose.xM - v.lengthM / 2, x1: i.pose.xM + v.lengthM / 2, y0: i.pose.yM - v.widthM / 2, y1: i.pose.yM + v.widthM / 2 };
};
const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
it('is a schema-valid synthetic 50-robot scene with unique ids and the declared fleet mix', () => {
  expect(checkSchema(spatial, 'spatial')).toEqual([]);
  expect(fixture.note).toMatch(/synthetic/i);
  const scene = spatial.scenes[0]!;
  const ids = scene.instances.map(i => i.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(fixture.robots).toHaveLength(50);
  expect(fixture.robots.filter(r => r.profileId === 'profile-differential')).toHaveLength(30);
  expect(fixture.robots.filter(r => r.profileId === 'profile-omnidirectional')).toHaveLength(20);
  expect(spatial.scenarios[0]!.workload!.jobs).toBe(1000);
  const shares = spatial.scenarios[0]!.workload!.mix.reduce((sum, row) => sum + row.share, 0);
  expect(shares).toBeCloseTo(1, 9);
});
it('places no station or robot inside a rack and keeps every object inside the floor', () => {
  const scene = spatial.scenes[0]!;
  const floor = scene.floor.state === 'known' ? scene.floor.value : null;
  const racks = scene.instances.filter(i => i.asset.id === 'rack-row').map(box);
  const others = scene.instances.filter(i => i.asset.id !== 'rack-row');
  for (const item of scene.instances) {
    const b = box(item);
    expect(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= floor!.lengthM && b.y1 <= floor!.widthM, item.id).toBe(true);
  }
  for (const item of others) for (const rack of racks) expect(overlaps(box(item), rack), item.id + ' overlaps a rack').toBe(false);
  const boxes = others.map(item => [item.id, box(item)] as const);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
    expect(overlaps(boxes[i]![1], boxes[j]![1]), `${boxes[i]![0]} overlaps ${boxes[j]![0]}`).toBe(false);
  for (const station of spatial.scenarios[0]!.stations) expect(scene.instances.some(i => i.id === station.instanceId), station.id).toBe(true);
});
