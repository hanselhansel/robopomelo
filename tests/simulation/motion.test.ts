import { describe, expect, it } from 'vitest';
import type { Pose, RobotProfile } from '@robopomelo/spec';
import { activeFootprint, applyPrimitive, assertDrive, checkMove, primitiveFeasible, primitiveSeconds } from '../../packages/simulation/src/motion.js';
import { DEFAULT_TOLERANCES, SimulationError, type Polygon, type StaticObstacle } from '../../packages/simulation/src/types.js';

const rect = (hx: number, hy: number, cx = 0, cy = 0): Polygon => [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]];
const pose = (xM: number, yM: number, yawRad = 0): Pose => ({ xM, yM, zM: 0, yawRad });
const profile = (over: Partial<RobotProfile> = {}): RobotProfile => ({
  id: 'r1', drive: 'differential', footprintM: rect(0.4, 0.4), loadedFootprintM: rect(0.7, 0.5), heightM: 1.2,
  maxSpeedMps: 1, maxAngularRadps: Math.PI / 2, accelerationMps2: 0.5, decelerationMps2: 0.5, reverse: false, ...over,
});
const pillar = (id: string, cx: number, cy: number, half = 0.05): StaticObstacle => ({ id, polygon: rect(half, half, cx, cy), zMinM: 0, zMaxM: 3 });

describe('drive feasibility', () => {
  it('differential robots translate only along their heading, reverse only when allowed', () => {
    const p = profile();
    expect(primitiveFeasible(p, pose(0, 0, 0), { kind: 'translate', dxM: 0.25, dyM: 0 })).toBe(true);
    expect(primitiveFeasible(p, pose(0, 0, 0), { kind: 'translate', dxM: 0, dyM: 0.25 })).toBe(false);
    expect(primitiveFeasible(p, pose(0, 0, 0), { kind: 'translate', dxM: -0.25, dyM: 0 })).toBe(false);
    expect(primitiveFeasible(profile({ reverse: true }), pose(0, 0, 0), { kind: 'translate', dxM: -0.25, dyM: 0 })).toBe(true);
    expect(primitiveFeasible(p, pose(0, 0, Math.PI / 4), { kind: 'translate', dxM: 0.25, dyM: 0.25 })).toBe(true);
    expect(primitiveFeasible(p, pose(0, 0, 0), { kind: 'rotate', dYawRad: Math.PI / 4 })).toBe(true);
  });
  it('omnidirectional robots translate in any direction', () => {
    const p = profile({ drive: 'omnidirectional' });
    expect(primitiveFeasible(p, pose(0, 0, 0), { kind: 'translate', dxM: 0, dyM: 0.25 })).toBe(true);
    expect(primitiveFeasible(p, pose(0, 0, 0), { kind: 'translate', dxM: -0.25, dyM: -0.25 })).toBe(true);
  });
  it('rejects unsupported drive strings with a typed error', () => {
    const bad = profile({ drive: 'mecanum-tracked' as RobotProfile['drive'] });
    expect(() => assertDrive(bad)).toThrow(SimulationError);
    try { assertDrive(bad); } catch (e) { expect((e as SimulationError).code).toBe('UNSUPPORTED_DRIVE'); }
    expect(() => primitiveFeasible(bad, pose(0, 0), { kind: 'rotate', dYawRad: 1 })).toThrow(SimulationError);
  });
  it('applies primitives and times them at maximum speed with acceleration ignored', () => {
    const p = profile();
    const moved = applyPrimitive(pose(1, 1, Math.PI / 2), { kind: 'translate', dxM: 0, dyM: 0.5 });
    expect(moved).toEqual(pose(1, 1.5, Math.PI / 2));
    expect(applyPrimitive(pose(0, 0, 0), { kind: 'rotate', dYawRad: Math.PI / 4 }).yawRad).toBeCloseTo(Math.PI / 4);
    expect(primitiveSeconds(p, { kind: 'translate', dxM: 0.25, dyM: 0 })).toBeCloseTo(0.25);
    expect(primitiveSeconds(p, { kind: 'rotate', dYawRad: -Math.PI / 4 })).toBeCloseTo(0.5);
  });
});

describe('load state and clearance', () => {
  it('selects the loaded footprint and blocks a rotation the empty robot can make', () => {
    const p = profile();
    expect(activeFootprint(p, false)).toEqual(rect(0.4, 0.4));
    expect(activeFootprint(p, true)).toEqual(rect(0.7, 0.5));
    const corner = [pillar('corner', 0.6, 0.6)];
    const rotate = { kind: 'rotate', dYawRad: Math.PI / 2 } as const;
    expect(checkMove(p, { profileId: 'r1', pose: pose(0, 0), loaded: false }, rotate, corner, DEFAULT_TOLERANCES)).toEqual({ kind: 'clear' });
    expect(checkMove(p, { profileId: 'r1', pose: pose(0, 0), loaded: true }, rotate, corner, DEFAULT_TOLERANCES)).toEqual({ kind: 'blocked', obstacleId: 'corner' });
  });
  it('reports infeasible primitives and unresolved sweeps without throwing', () => {
    const p = profile();
    expect(checkMove(p, { profileId: 'r1', pose: pose(0, 0), loaded: false }, { kind: 'translate', dxM: 0, dyM: 1 }, [], DEFAULT_TOLERANCES)).toEqual({ kind: 'infeasible', reason: 'DRIVE_CONSTRAINT' });
    expect(checkMove(p, { profileId: 'r1', pose: pose(0, 0), loaded: true }, { kind: 'rotate', dYawRad: 1 }, [], { ...DEFAULT_TOLERANCES, sweepBoundM: 1e-9 })).toEqual({ kind: 'unresolved', reason: 'SUBDIVISION_LIMIT' });
  });
  it('translation is blocked by an obstacle in the middle of the move only', () => {
    const p = profile();
    const move = { kind: 'translate', dxM: 2, dyM: 0 } as const;
    expect(checkMove(p, { profileId: 'r1', pose: pose(0, 0), loaded: false }, move, [pillar('mid', 1, 0)], DEFAULT_TOLERANCES)).toEqual({ kind: 'blocked', obstacleId: 'mid' });
    expect(checkMove(p, { profileId: 'r1', pose: pose(0, 0), loaded: false }, move, [pillar('side', 1, 1)], DEFAULT_TOLERANCES)).toEqual({ kind: 'clear' });
  });
});
