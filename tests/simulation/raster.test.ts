import { expect, it } from 'vitest';
import type { Pose, RobotProfile } from '@robopomelo/spec';
import { RasterOracle } from '../../packages/simulation/src/raster.js';
import { checkMove, standingClear } from '../../packages/simulation/src/motion.js';
import { findRoute } from '../../packages/simulation/src/route.js';
import { checkTrace } from '../../packages/simulation/src/trace-check.js';
import { DEFAULT_TOLERANCES, type Polygon, type StaticObstacle } from '../../packages/simulation/src/types.js';
const rect = (hx: number, hy: number, cx = 0, cy = 0): Polygon => [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]];
const pose = (xM: number, yM: number, yawRad = 0): Pose => ({ xM, yM, zM: 0, yawRad });
const profile: RobotProfile = { id: 'r1', drive: 'omnidirectional', footprintM: rect(0.4, 0.3), loadedFootprintM: rect(0.6, 0.45), heightM: 1.2, maxSpeedMps: 1, maxAngularRadps: Math.PI / 2, accelerationMps2: 0.5, decelerationMps2: 0.5, reverse: true };
const box = (id: string, x0: number, x1: number, y0: number, y1: number, zMinM = 0, zMaxM = 3): StaticObstacle => ({ id, polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], zMinM, zMaxM });
const scene = [box('w1', 2.4, 2.6, 0.5, 6), box('w2', 2.4, 2.6, -6, -0.5), box('pillar', 4.05, 4.55, -0.9, 0.3), box('beam', 6, 6.3, -6, 6, 2.0, 2.5), { id: 'diag', polygon: [[7, 1], [8, 2], [7.5, 3]] as Polygon, zMinM: 0, zMaxM: 3 }];
const bounds = { minXM: -1, maxXM: 9, minYM: -5, maxYM: 5 };
const tol = { ...DEFAULT_TOLERANCES, gridM: 0.5 };
const yawUnit = (2 * Math.PI) / tol.yawSteps;
it('equals the exact polygon check for every sampled lattice pose and primitive', () => {
  const oracle = new RasterOracle(profile, scene, bounds, tol);
  let total = 0, agree = 0, conservative = 0;
  for (let ix = -2; ix <= 18; ix++) for (let iy = -10; iy <= 10; iy++) for (let iyaw = 0; iyaw < tol.yawSteps; iyaw++) for (const loaded of [false, true]) {
    const p = pose(ix * tol.gridM, iy * tol.gridM, iyaw * yawUnit);
    const state = { profileId: 'r1', pose: p, loaded };
    const primitives = [
      { kind: 'translate' as const, dxM: tol.gridM, dyM: 0 }, { kind: 'translate' as const, dxM: tol.gridM, dyM: tol.gridM }, { kind: 'translate' as const, dxM: -tol.gridM, dyM: 0 },
      { kind: 'rotate' as const, dYawRad: yawUnit }, { kind: 'rotate' as const, dYawRad: -yawUnit },
    ];
    for (const primitive of primitives) {
      const exact = checkMove(profile, state, primitive, scene, tol), fast = oracle.check(state, primitive);
      total++;
      expect(fast, `${JSON.stringify(state.pose)} ${JSON.stringify(primitive)}`).toEqual(exact);
      if (fast.kind === exact.kind) agree++; else conservative++;
    }
    const exactStanding = standingClear(profile, p, loaded, scene, tol), fastStanding = oracle.standing(state);
    expect(fastStanding).toEqual(exactStanding);
  }
  expect(total).toBeGreaterThan(5000);
  expect(agree).toBe(total);
  expect(conservative).toBe(0);
});
it('respects height intervals and off-lattice poses fall back to the exact check', () => {
  const oracle = new RasterOracle(profile, scene, bounds, tol);
  const under = { profileId: 'r1', pose: pose(6, 0), loaded: false };
  expect(oracle.standing(under).kind).toBe('clear');
  const tall = new RasterOracle({ ...profile, heightM: 2.2 }, scene, bounds, tol);
  expect(tall.standing(under).kind).toBe('blocked');
  const off = { profileId: 'r1', pose: pose(0.07, 0.11, 0.3), loaded: false };
  expect(oracle.check(off, { kind: 'translate', dxM: 0.5, dyM: 0 })).toEqual(checkMove(profile, off, { kind: 'translate', dxM: 0.5, dyM: 0 }, scene, tol));
});
it('routes found through the raster oracle are accepted by the independent polygon trace checker', () => {
  const oracle = new RasterOracle(profile, scene, bounds, tol);
  for (const goal of [pose(8.5, 0), pose(8.5, -4), pose(3.5, 4, Math.PI)]) {
    const start = { profileId: 'r1', pose: pose(0, 0), loaded: false };
    const result = findRoute(profile, start, { pose: goal, transition: 'none' }, [], { bounds, tolerances: tol, staticOracle: oracle });
    expect(result.kind, JSON.stringify(goal)).toBe('path');
    if (result.kind === 'path') expect(checkTrace(profile, start, result.steps, scene, tol).ok).toBe(true);
  }
});
