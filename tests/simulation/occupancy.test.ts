import { expect, it } from 'vitest';
import type { Pose, RobotProfile } from '@robopomelo/spec';
import { findRoute } from '../../packages/simulation/src/route.js';
import { StaticMoveCache } from '../../packages/simulation/src/occupancy.js';
import { checkMove } from '../../packages/simulation/src/motion.js';
import { DEFAULT_TOLERANCES, type Polygon, type StaticObstacle } from '../../packages/simulation/src/types.js';
const rect = (hx: number, hy: number, cx = 0, cy = 0): Polygon => [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]];
const pose = (xM: number, yM: number, yawRad = 0): Pose => ({ xM, yM, zM: 0, yawRad });
const profile: RobotProfile = { id: 'r1', drive: 'differential', footprintM: rect(0.4, 0.4), loadedFootprintM: rect(0.6, 0.6), heightM: 1.2, maxSpeedMps: 1, maxAngularRadps: Math.PI / 2, accelerationMps2: 0.5, decelerationMps2: 0.5, reverse: false };
const box = (id: string, x0: number, x1: number, y0: number, y1: number): StaticObstacle => ({ id, polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], zMinM: 0, zMaxM: 3 });
const maze = [box('w1', 2.4, 2.6, 0.5, 6), box('w2', 2.4, 2.6, -6, -0.5), box('w3', 4, 4.5, -2, 2), box('w4', 6, 6.2, -6, -1), box('w5', 6, 6.2, 1, 6)];
const bounds = { minXM: -1, maxXM: 9, minYM: -5, maxYM: 5 };
const tol = DEFAULT_TOLERANCES;
it('cached static move checks equal direct polygon checks for every lattice pose and primitive', () => {
  const cache = new StaticMoveCache(profile, maze, tol);
  let checks = 0;
  for (let ix = -2; ix <= 18; ix++) for (let iy = -8; iy <= 8; iy++) for (let iyaw = 0; iyaw < tol.yawSteps; iyaw++) for (const loaded of [false, true]) {
    const p = pose(ix * tol.gridM, iy * tol.gridM, (iyaw * 2 * Math.PI) / tol.yawSteps);
    const state = { profileId: 'r1', pose: p, loaded };
    for (const primitive of [{ kind: 'translate' as const, dxM: tol.gridM * Math.cos(p.yawRad), dyM: tol.gridM * Math.sin(p.yawRad) }, { kind: 'rotate' as const, dYawRad: (2 * Math.PI) / tol.yawSteps }]) {
      expect(cache.check(state, primitive)).toEqual(checkMove(profile, state, primitive, maze, tol));
      expect(cache.check(state, primitive)).toEqual(checkMove(profile, state, primitive, maze, tol));
      checks++;
    }
  }
  expect(checks).toBeGreaterThan(1000);
  expect(cache.size).toBe(checks);
});
it('route search with the cache yields byte-identical paths to the uncached search, and dynamic extras are still checked', () => {
  const start = { profileId: 'r1', pose: pose(0, 0), loaded: false };
  const goal = { pose: pose(8, 0), transition: 'none' as const };
  const plain = findRoute(profile, start, goal, maze, { bounds, tolerances: tol });
  const cache = new StaticMoveCache(profile, maze, tol);
  const cached = findRoute(profile, start, goal, [], { bounds, tolerances: tol, staticOracle: cache });
  expect(JSON.stringify(cached)).toBe(JSON.stringify(plain));
  expect(plain.kind).toBe('path');
  // Dynamic extras (another robot) must still be checked; an omnidirectional robot can sidestep it.
  const omni: RobotProfile = { ...profile, id: 'o1', drive: 'omnidirectional', reverse: true };
  const omniStart = { ...start, profileId: 'o1' };
  const blocker = [box('robot-x', 3.0, 3.4, 0.9, 1.5)];
  const omniCache = new StaticMoveCache(omni, maze, tol);
  const plainOmni = findRoute(omni, omniStart, goal, maze, { bounds, tolerances: tol });
  const withExtra = findRoute(omni, omniStart, goal, blocker, { bounds, tolerances: tol, staticOracle: omniCache });
  const withExtraPlain = findRoute(omni, omniStart, goal, [...maze, ...blocker], { bounds, tolerances: tol });
  expect(JSON.stringify(withExtra)).toBe(JSON.stringify(withExtraPlain));
  expect(withExtra.kind).toBe('path');
  expect(plainOmni.kind).toBe('path');
  expect((withExtra as { ticks: number }).ticks).toBeGreaterThanOrEqual((plainOmni as { ticks: number }).ticks);
});
