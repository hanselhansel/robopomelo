import { describe, expect, it } from 'vitest';
import type { Pose } from '@robopomelo/spec';
import { ticksFor, ticksForSeconds, compareRobotIds, orderRobotIds } from '../../packages/simulation/src/clock.js';
import { collides, convexHull, inflate, polygonsOverlap, sweepRotation, sweepTranslation, transformPolygon } from '../../packages/simulation/src/sweep.js';
import { DEFAULT_TOLERANCES, obstacleFromInstance, type Polygon, type StaticObstacle } from '../../packages/simulation/src/types.js';

const rect = (hx: number, hy: number, cx = 0, cy = 0): Polygon => [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]];
const pose = (xM: number, yM: number, yawRad = 0): Pose => ({ xM, yM, zM: 0, yawRad });
const pillar = (id: string, cx: number, cy: number, half = 0.05, zMinM = 0, zMaxM = 3): StaticObstacle => ({ id, polygon: rect(half, half, cx, cy), zMinM, zMaxM });

describe('clock', () => {
  it('rounds durations up to integer ticks and never returns fractions', () => {
    expect(ticksFor(0.25, 1)).toBe(3);
    expect(ticksFor(10, 1)).toBe(100);
    expect(ticksForSeconds(0.25 * 40)).toBe(100);
    expect(ticksFor(0, 1)).toBe(0);
    expect(() => ticksFor(1, 0)).toThrow(/INVALID_SPEED|positive/);
  });
  it('orders robot ids by code point for stable tie-breaking', () => {
    expect(orderRobotIds(['r10', 'r2', 'R1'])).toEqual(['R1', 'r10', 'r2']);
    expect(compareRobotIds('a', 'a')).toBe(0);
  });
});

describe('polygon math', () => {
  it('transforms by pose and detects overlap via SAT', () => {
    const a = transformPolygon(rect(0.5, 0.25), pose(1, 0, Math.PI / 2));
    expect(a.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])).toEqual([[1.25, -0.5], [1.25, 0.5], [0.75, 0.5], [0.75, -0.5]]);
    expect(polygonsOverlap(rect(0.5, 0.5), rect(0.5, 0.5, 0.9, 0))).toBe(true);
    expect(polygonsOverlap(rect(0.5, 0.5), rect(0.5, 0.5, 1.1, 0))).toBe(false);
    // Diagonal separation that axis-aligned bounding boxes would miss.
    const diamond: Polygon = [[1, 0], [2, 1], [1, 2], [0, 1]];
    expect(polygonsOverlap(rect(0.2, 0.2, 0.15, 0.15), diamond)).toBe(false);
    expect(polygonsOverlap(rect(0.2, 0.2, 0.5, 0.5), diamond)).toBe(true);
  });
  it('hulls and inflates conservatively', () => {
    const hull = convexHull([[0, 0], [1, 0], [0.5, 0.2], [1, 1], [0, 1], [0.5, 0.5]]);
    expect(hull).toHaveLength(4);
    const fat = inflate(rect(0.5, 0.5), 0.1);
    expect(polygonsOverlap(fat, rect(0.05, 0.05, 0.62, 0))).toBe(true);
    expect(polygonsOverlap(rect(0.5, 0.5), rect(0.05, 0.05, 0.62, 0))).toBe(false);
  });
});

describe('swept volumes', () => {
  it('translation sweep covers the whole path, not only endpoints', () => {
    const swept = sweepTranslation(rect(0.4, 0.4), pose(0, 0), pose(4, 0), DEFAULT_TOLERANCES);
    const mid = pillar('mid', 2, 0);
    expect(collides(swept, { zMinM: 0, zMaxM: 1.2 }, [mid])).toEqual({ hit: true, obstacleId: 'mid', polygonIndex: 0 });
    expect(collides([transformPolygon(rect(0.4, 0.4), pose(0, 0)), transformPolygon(rect(0.4, 0.4), pose(4, 0))], { zMinM: 0, zMaxM: 1.2 }, [mid])).toEqual({ hit: false });
  });
  it('rotation of a rectangular load strikes a corner that both endpoints clear', () => {
    const loaded = rect(0.7, 0.5);
    const corner = pillar('corner', 0.6, 0.6);
    const z = { zMinM: 0, zMaxM: 1.2 };
    expect(collides([transformPolygon(loaded, pose(0, 0, 0))], z, [corner])).toEqual({ hit: false });
    expect(collides([transformPolygon(loaded, pose(0, 0, Math.PI / 2))], z, [corner])).toEqual({ hit: false });
    const swept = sweepRotation(loaded, pose(0, 0, 0), Math.PI / 2, DEFAULT_TOLERANCES);
    expect(swept.resolved).toBe(true);
    if (!swept.resolved) return;
    expect(swept.polygons.length).toBeGreaterThan(1);
    expect(collides(swept.polygons, z, [corner]).hit).toBe(true);
    // The 0.8 m empty footprint turns inside the same corner.
    const empty = sweepRotation(rect(0.4, 0.4), pose(0, 0, 0), Math.PI / 2, DEFAULT_TOLERANCES);
    expect(empty.resolved && collides(empty.polygons, z, [corner]).hit).toBe(false);
  });
  it('footprint offset from the drive origin pivots about the pose point', () => {
    const offset = rect(0.5, 0.2, 1.0, 0); // x in [0.5, 1.5], y in [-0.2, 0.2]
    const swept = sweepRotation(offset, pose(0, 0, 0), Math.PI / 2, DEFAULT_TOLERANCES);
    expect(swept.resolved).toBe(true);
    if (!swept.resolved) return;
    const z = { zMinM: 0, zMaxM: 1 };
    expect(collides(swept.polygons, z, [pillar('arc', 0.8, 0.8)]).hit).toBe(true); // on the quarter annulus
    expect(collides(swept.polygons, z, [pillar('origin', 0, 0)]).hit).toBe(false); // pivot itself stays clear
    expect(collides(swept.polygons, z, [pillar('behind', -0.8, 0)]).hit).toBe(false);
  });
  it('reports unresolved when the chord bound cannot be met within maxSubdivisions', () => {
    const r = sweepRotation(rect(0.7, 0.5), pose(0, 0, 0), Math.PI / 4, { ...DEFAULT_TOLERANCES, sweepBoundM: 1e-9 });
    expect(r).toEqual({ resolved: false, reason: 'SUBDIVISION_LIMIT' });
  });
  it('height intervals let overhead obstacles clear short robots', () => {
    const swept = sweepTranslation(rect(0.4, 0.4), pose(0, 0), pose(4, 0), DEFAULT_TOLERANCES);
    const robot = { zMinM: 0, zMaxM: 1.2 };
    expect(collides(swept, robot, [pillar('high', 2, 0, 0.05, 2.0, 2.5)]).hit).toBe(false);
    expect(collides(swept, robot, [pillar('low', 2, 0, 0.05, 1.0, 2.5)]).hit).toBe(true);
  });
  it('builds rectangular obstacles from instances with valued dimensions only', () => {
    const base = { id: 'rack', asset: { id: 'a', version: '1', sha256: 'x' }, pose: pose(2, 3, Math.PI / 2), sourceIds: [] };
    const known = obstacleFromInstance({ ...base, dimensions: { state: 'known', value: { lengthM: 2, widthM: 1, heightM: 4 }, sourceIds: [] } });
    expect(known?.zMaxM).toBe(4);
    expect(known?.polygon.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])).toEqual([[2.5, 2], [2.5, 4], [1.5, 4], [1.5, 2]]);
    expect(obstacleFromInstance({ ...base, dimensions: { state: 'unknown', reason: 'no plan' } })).toBeNull();
  });
});
