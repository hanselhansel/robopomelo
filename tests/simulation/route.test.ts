import { describe, expect, it } from 'vitest';
import type { Pose, RobotProfile } from '@robopomelo/spec';
import { findRoute, type RouteOptions, type RouteResult } from '../../packages/simulation/src/route.js';
import { checkTrace } from '../../packages/simulation/src/trace-check.js';
import { DEFAULT_TOLERANCES, SimulationError, TICK_MS, type Polygon, type StaticObstacle } from '../../packages/simulation/src/types.js';

const rect = (hx: number, hy: number, cx = 0, cy = 0): Polygon => [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]];
const pose = (xM: number, yM: number, yawRad = 0): Pose => ({ xM, yM, zM: 0, yawRad });
const profile = (over: Partial<RobotProfile> = {}): RobotProfile => ({
  id: 'r1', drive: 'differential', footprintM: rect(0.4, 0.4), loadedFootprintM: rect(0.6, 0.6), heightM: 1.2,
  maxSpeedMps: 1, maxAngularRadps: Math.PI / 2, accelerationMps2: 0.5, decelerationMps2: 0.5, reverse: false, ...over,
});
const box = (id: string, x0: number, x1: number, y0: number, y1: number, zMinM = 0, zMaxM = 3): StaticObstacle => ({ id, polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], zMinM, zMaxM });
/** Doorway 1.0 m wide at x = 2.5 in a corridor that is otherwise open. */
const doorway = [box('wall-north', 2.4, 2.6, 0.5, 5), box('wall-south', 2.4, 2.6, -5, -0.5)];
const options = (over: Partial<RouteOptions> = {}): RouteOptions => ({ bounds: { minXM: -1, maxXM: 6, minYM: -3, maxYM: 3 }, tolerances: DEFAULT_TOLERANCES, ...over });
const goal = (p: Pose, transition: 'none' | 'load' | 'unload' = 'none') => ({ pose: p, transition });
const path = (r: RouteResult) => { expect(r.kind).toBe('path'); return r.kind === 'path' ? r : (undefined as never); };

describe('findRoute', () => {
  it('passes the empty robot through a 1.0 m doorway and blocks the 1.2 m loaded one', () => {
    const p = profile();
    const empty = findRoute(p, { profileId: 'r1', pose: pose(0, 0), loaded: false }, goal(pose(5, 0)), doorway, options());
    const r = path(empty);
    expect(r.steps.at(-1)?.pose).toEqual(pose(5, 0));
    expect(r.steps.every((s) => Number.isInteger(s.tick))).toBe(true);
    const loaded = findRoute(p, { profileId: 'r1', pose: pose(0, 0), loaded: true }, goal(pose(5, 0)), doorway, options());
    expect(loaded.kind).toBe('infeasible');
  });
  it('respects overhead clearance: a 2.0 m high beam clears a 1.2 m robot, a 1.0 m one does not', () => {
    const p = profile();
    const start = { profileId: 'r1', pose: pose(0, 0), loaded: false };
    expect(findRoute(p, start, goal(pose(5, 0)), [box('beam-high', 2.4, 2.6, -5, 5, 2.0, 2.5)], options()).kind).toBe('path');
    expect(findRoute(p, start, goal(pose(5, 0)), [box('beam-low', 2.4, 2.6, -5, 5, 1.0, 2.5)], options()).kind).toBe('infeasible');
  });
  it('rejects a rotation of a rectangular load that strikes a corner despite clear endpoints', () => {
    const p = profile({ loadedFootprintM: rect(0.7, 0.5) });
    const corner = [box('corner', 0.55, 0.65, 0.55, 0.65)];
    const bounds = { minXM: 0, maxXM: 0, minYM: 0, maxYM: 0 }; // rotation in place is the only option
    const turned = findRoute(p, { profileId: 'r1', pose: pose(0, 0, 0), loaded: true }, goal(pose(0, 0, Math.PI / 2)), corner, options({ bounds }));
    expect(turned.kind).toBe('infeasible');
    const emptyTurn = findRoute(p, { profileId: 'r1', pose: pose(0, 0, 0), loaded: false }, goal(pose(0, 0, Math.PI / 2)), corner, options({ bounds }));
    expect(path(emptyTurn).steps.map((s) => s.primitive.kind)).toEqual(['rotate', 'rotate']);
  });
  it('checks station clearance in both load states for load/unload goals', () => {
    const p = profile({ loadedFootprintM: rect(0.7, 0.5) });
    // Fits the empty robot at the goal but not the loaded one that will exist after pickup.
    const tight = [box('shelf', 4.45, 4.6, -1, 1)];
    const empty = { profileId: 'r1', pose: pose(0, 0), loaded: false };
    expect(findRoute(p, empty, goal(pose(4, 0), 'none'), tight, options()).kind).toBe('path');
    const load = findRoute(p, empty, goal(pose(4, 0), 'load'), tight, options());
    expect(load).toMatchObject({ kind: 'infeasible', reason: 'STATION_CLEARANCE' });
  });
  it('returns infeasible for an unreachable goal without throwing', () => {
    const sealed = [box('wall', 2.4, 2.6, -5, 5)];
    const r = findRoute(profile(), { profileId: 'r1', pose: pose(0, 0), loaded: false }, goal(pose(5, 0)), sealed, options());
    expect(r.kind).toBe('infeasible');
  });
  it('rejects unsupported drive profiles with SimulationError UNSUPPORTED_DRIVE', () => {
    const bad = profile({ drive: 'legged' as RobotProfile['drive'] });
    expect(() => findRoute(bad, { profileId: 'r1', pose: pose(0, 0), loaded: false }, goal(pose(1, 0)), [], options())).toThrow(SimulationError);
    try { findRoute(bad, { profileId: 'r1', pose: pose(0, 0), loaded: false }, goal(pose(1, 0)), [], options()); }
    catch (e) { expect((e as SimulationError).code).toBe('UNSUPPORTED_DRIVE'); }
  });
  it('returns unresolved at the expansion limit instead of throwing', () => {
    const r = findRoute(profile(), { profileId: 'r1', pose: pose(0, 0), loaded: false }, goal(pose(5, 0)), [], options({ expansionLimit: 3 }));
    expect(r).toMatchObject({ kind: 'unresolved', reason: 'EXPANSION_LIMIT' });
  });
  it('marks the route unresolved when a sweep cannot meet its bound', () => {
    const r = findRoute(profile(), { profileId: 'r1', pose: pose(0, 0), loaded: false }, goal(pose(0, 0, Math.PI / 2)), [], options({ tolerances: { ...DEFAULT_TOLERANCES, sweepBoundM: 1e-9 } }));
    expect(r).toMatchObject({ kind: 'unresolved', reason: 'SWEEP_BOUND' });
  });
  it('times a straight 10 m route at 1 m/s at exactly 100 integer ticks', () => {
    const r = path(findRoute(profile(), { profileId: 'r1', pose: pose(0, 0), loaded: false }, goal(pose(10, 0)), [], options({ bounds: { minXM: -1, maxXM: 11, minYM: -1, maxYM: 1 } })));
    expect(TICK_MS).toBe(100);
    expect(r.ticks).toBe(100);
    expect(r.steps).toHaveLength(40);
    expect(r.steps.map((s) => s.tick)).toEqual(r.steps.map((_, i) => Math.ceil((i + 1) * 2.5)));
    expect(r.steps.every((s) => Number.isInteger(s.tick))).toBe(true);
  });
  it('is deterministic: identical inputs yield byte-identical steps', () => {
    const run = () => findRoute(profile({ drive: 'omnidirectional' }), { profileId: 'r1', pose: pose(0, 0), loaded: true }, goal(pose(4, 2, Math.PI / 2)), [box('pillar', 1.9, 2.1, -0.4, 0.6)], options());
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
    expect(run().kind).toBe('path');
  });
  it('rejects off-lattice poses explicitly', () => {
    expect(() => findRoute(profile(), { profileId: 'r1', pose: pose(0.1, 0), loaded: false }, goal(pose(1, 0)), [], options())).toThrow(/OFF_LATTICE|lattice/);
    expect(() => findRoute(profile(), { profileId: 'r1', pose: pose(0, 0), loaded: false }, goal(pose(1, 0)), [], options({ tolerances: { ...DEFAULT_TOLERANCES, yawSteps: 6 } }))).toThrow(/UNSUPPORTED_YAW_STEPS|yaw/);
  });
});

describe('checkTrace', () => {
  const p = profile({ drive: 'omnidirectional', loadedFootprintM: rect(0.7, 0.45) });
  const start = { profileId: 'r1', pose: pose(0, 0), loaded: true };
  const obstacles = [box('pillar', 1.9, 2.1, -0.4, 0.6), ...doorway.map((o) => ({ ...o, polygon: o.polygon.map(([x, y]): [number, number] => [x + 2, y]) }))];
  it('accepts the path the search produced', () => {
    const r = path(findRoute(p, start, goal(pose(5.5, -1, Math.PI / 2)), obstacles, options()));
    expect(checkTrace(p, start, r.steps, obstacles, DEFAULT_TOLERANCES)).toEqual({ ok: true, steps: r.steps.length, samples: expect.any(Number) });
  });
  it('detects an obstacle injected across one intermediate step', () => {
    const r = path(findRoute(p, start, goal(pose(5.5, -1, Math.PI / 2)), obstacles, options()));
    const rotateIndex = r.steps.findIndex((s) => s.primitive.kind === 'rotate');
    const translateIndex = r.steps.findIndex((s, i) => s.primitive.kind === 'translate' && i > 0);
    for (const index of [rotateIndex, translateIndex]) {
      expect(index).toBeGreaterThanOrEqual(0);
      const before = index === 0 ? start.pose : r.steps[index - 1]!.pose;
      const after = r.steps[index]!.pose;
      const injected = box('injected', (before.xM + after.xM) / 2 - 0.02, (before.xM + after.xM) / 2 + 0.02, (before.yM + after.yM) / 2 - 0.02, (before.yM + after.yM) / 2 + 0.02);
      const verdict = checkTrace(p, start, r.steps, [...obstacles, injected], DEFAULT_TOLERANCES);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict).toMatchObject({ code: 'CONFLICT', obstacleId: 'injected' });
      if (!verdict.ok && verdict.code === 'CONFLICT') expect(verdict.stepIndex).toBeLessThanOrEqual(index);
    }
  });
  it('catches a corner strike in a hand-written path whose endpoints are clear', () => {
    const corner = [box('corner', 0.55, 0.65, 0.55, 0.65)];
    const steps = [{ pose: pose(0, 0, Math.PI / 2), tick: 10, primitive: { kind: 'rotate', dYawRad: Math.PI / 2 } as const }];
    expect(checkTrace(p, start, steps, corner, DEFAULT_TOLERANCES)).toMatchObject({ ok: false, code: 'CONFLICT', stepIndex: 0, obstacleId: 'corner' });
  });
  it('rejects inconsistent poses and non-monotonic ticks', () => {
    const steps = [{ pose: pose(1, 0), tick: 3, primitive: { kind: 'translate', dxM: 0.5, dyM: 0 } as const }];
    expect(checkTrace(p, start, steps, [], DEFAULT_TOLERANCES)).toMatchObject({ ok: false, code: 'POSE_MISMATCH', stepIndex: 0 });
    const back = [{ pose: pose(0.5, 0), tick: 3, primitive: { kind: 'translate', dxM: 0.5, dyM: 0 } as const }, { pose: pose(1, 0), tick: 2, primitive: { kind: 'translate', dxM: 0.5, dyM: 0 } as const }];
    expect(checkTrace(p, start, back, [], DEFAULT_TOLERANCES)).toMatchObject({ ok: false, code: 'TICK_ORDER', stepIndex: 1 });
  });
});
