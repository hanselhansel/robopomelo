import { describe, expect, it } from 'vitest';
import type { Instance, Scene, SpatialAction } from '@robopomelo/spec';
import { compileScene, bundledCatalog } from '@robopomelo/spatial';
import { SceneStore, inverseOf, applyAction } from '../../apps/web/src/features/scene/scene-store.js';
import { collidingIds, fitCamera, localPolygon, normalizeYaw, polygonsOverlap, sceneBounds, screenToWorld, snapPose, snapValue, validatePose, worldToScreen } from '../../apps/web/src/features/scene/transforms.js';
import { bootstrapActions, envelopeFor, isStale, nextInstanceId, placeAction } from '../../apps/web/src/features/scene/actions.js';

const catalog = bundledCatalog();
const rackEntry = catalog.entries.find((e) => e.id === 'rack-bay')!;
const asset = { id: rackEntry.id, version: rackEntry.version, sha256: rackEntry.sha256 };
const known = <T,>(value: T) => ({ state: 'known' as const, value, sourceIds: ['evidence-plan'] });
const rack = (id: string, xM: number, yM = 2, yawRad = 0): Instance => ({ id, asset, pose: { xM, yM, zM: 0, yawRad }, dimensions: known({ lengthM: 2.7, widthM: 1.1, heightM: 6 }), sourceIds: [] });
const scene: Scene = { id: 'scene-1', name: 'Receiving', floor: known({ lengthM: 20, widthM: 12 }), instances: [rack('rack-1', 3), rack('rack-2', 8)] };
const response = (s: Scene = scene, rev = 'rev-1') => ({ scene: s, compiled: compileScene(s, catalog), bindings: [], sourceRevision: rev, sourceHash: 'h-' + rev });
const loaded = () => { const store = new SceneStore(); store.load(response()); return store; };

describe('scene store', () => {
  it('keeps the selection across a top-down/3D switch without touching canonical state', () => {
    const store = loaded();
    store.select('rack-2');
    const before = JSON.stringify(store.state.scene);
    store.setView('3d');
    expect(store.state.camera.mode).toBe('3d');
    expect(store.state.selectedId).toBe('rack-2');
    store.setView('top-down');
    expect(store.state.selectedId).toBe('rack-2');
    expect(JSON.stringify(store.state.scene)).toBe(before);
  });
  it('previews a move without changing canonical state and commits exactly one action', () => {
    const store = loaded();
    store.select('rack-1');
    store.beginPreview('rack-1');
    store.updatePreview({ xM: 4.523, yM: 2.04 });
    store.updatePreview({ xM: 5.02, yM: 2.04 });
    expect(store.effectivePose('rack-1')).toEqual({ xM: 5, yM: 2.05, zM: 0, yawRad: 0 });
    expect(store.state.scene!.instances[0]!.pose.xM).toBe(3);
    const actions = store.commitPreview();
    expect(actions).toEqual([{ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 5, yM: 2.05, zM: 0, yawRad: 0 } }]);
    expect(store.state.preview).toBeNull();
    expect(store.state.scene!.instances[0]!.pose.xM).toBe(3);
  });
  it('commits nothing when the preview returns to its baseline', () => {
    const store = loaded();
    store.beginPreview('rack-1');
    store.updatePreview({ xM: 3.01 });
    expect(store.commitPreview()).toEqual([]);
  });
  it('restores the baseline on Escape', () => {
    const store = loaded();
    store.beginPreview('rack-1');
    store.updatePreview({ xM: 9, yawRad: 1 });
    store.cancelPreview();
    expect(store.state.preview).toBeNull();
    expect(store.effectivePose('rack-1')).toEqual({ xM: 3, yM: 2, zM: 0, yawRad: 0 });
  });
  it('nudges by one snap increment, or ten with Shift, and snaps to the grid', () => {
    const store = loaded();
    store.select('rack-1');
    store.nudge(1, 0, false);
    expect(store.effectivePose('rack-1').xM).toBeCloseTo(3.05, 6);
    store.nudge(0, -1, true);
    expect(store.effectivePose('rack-1').yM).toBeCloseTo(1.5, 6);
    store.nudge(-1, 0, true);
    expect(store.effectivePose('rack-1').xM).toBeCloseTo(2.55, 6);
    expect(store.commitPreview()).toHaveLength(1);
    store.setSnap({ positionM: 0.1, angleRad: Math.PI / 18 });
    store.nudge(1, 0, false); // canonical pose is still 3 until the server reload
    expect(store.effectivePose('rack-1').xM).toBeCloseTo(3.1, 6);
  });
  it('produces the same action for a numeric edit, a keyboard nudge and a drag', () => {
    const drag = loaded();
    drag.beginPreview('rack-1');
    drag.updatePreview({ xM: 3.049, yM: 2.001 });
    const keyboard = loaded();
    keyboard.select('rack-1');
    keyboard.nudge(1, 0, false);
    const numeric = loaded();
    numeric.beginPreview('rack-1');
    numeric.updatePreview({ xM: 3.05 });
    const [a, b, c] = [drag, keyboard, numeric].map((s) => s.commitPreview());
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a).toHaveLength(1);
  });
  it('previews and commits a resize as one action carrying the dimension state', () => {
    const store = loaded();
    store.beginPreview('rack-2');
    store.updatePreview({ lengthM: 3.6 });
    expect(store.state.scene!.instances[1]!.dimensions).toEqual(known({ lengthM: 2.7, widthM: 1.1, heightM: 6 }));
    expect(store.commitPreview()).toEqual([{ kind: 'resize', sceneId: 'scene-1', id: 'rack-2', dimensions: known({ lengthM: 3.6, widthM: 1.1, heightM: 6 }) }]);
  });
  it('drops the preview and selection of an object that disappeared on reload', () => {
    const store = loaded();
    store.select('rack-2');
    store.beginPreview('rack-2');
    store.load(response({ ...scene, instances: [rack('rack-1', 3)] }, 'rev-2'));
    expect(store.state.selectedId).toBeNull();
    expect(store.state.preview).toBeNull();
    expect(store.state.base).toEqual({ sourceRevision: 'rev-2', sourceHash: 'h-rev-2' });
  });
});

describe('undo', () => {
  it('inverts a move to the previous pose and a place to a removal', () => {
    const before = rack('rack-1', 3);
    const move: SpatialAction = { kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 7, yM: 1, zM: 0, yawRad: 0.5 } };
    expect(inverseOf(move, before)).toEqual({ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 3, yM: 2, zM: 0, yawRad: 0 } });
    expect(inverseOf({ kind: 'place', sceneId: 'scene-1', instance: before }, null)).toEqual({ kind: 'remove', sceneId: 'scene-1', id: 'rack-1', replacementId: null });
    expect(inverseOf({ kind: 'remove', sceneId: 'scene-1', id: 'rack-1', replacementId: null }, before)).toEqual({ kind: 'place', sceneId: 'scene-1', instance: before });
    expect(inverseOf(move, null)).toBeNull();
    expect(applyAction(before, move)?.pose.xM).toBe(7);
  });
  it('records undo entries with the expected after state and flags a changed object', () => {
    const store = loaded();
    const move: SpatialAction = { kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 7, yM: 2, zM: 0, yawRad: 0 } };
    store.recordUndo([move]);
    store.load(response({ ...scene, instances: [rack('rack-1', 7), rack('rack-2', 8)] }, 'rev-2'));
    expect(store.undoConflict()).toBeNull();
    store.load(response({ ...scene, instances: [rack('rack-1', 7.5), rack('rack-2', 8)] }, 'rev-3'));
    expect(store.undoConflict()).toMatch(/changed/);
    expect(store.popUndo()!.inverse).toEqual({ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 3, yM: 2, zM: 0, yawRad: 0 } });
    expect(store.popUndo()).toBeNull();
  });
});

describe('transforms', () => {
  it('snaps values and poses and normalizes yaw into (-pi, pi]', () => {
    expect(snapValue(1.024, 0.05)).toBe(1);
    expect(snapValue(-0.026, 0.05)).toBe(-0.05);
    expect(normalizeYaw(Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeYaw(-Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeYaw(3 * Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1);
    const snapped = snapPose({ xM: 1.02, yM: 2.98, zM: 0, yawRad: 0.08 }, { positionM: 0.05, angleRad: Math.PI / 36 });
    expect(snapped).toEqual({ xM: 1, yM: 3, zM: 0, yawRad: snapValue(0.08, Math.PI / 36) });
    expect(validatePose({ xM: Number.NaN, yM: 0, zM: 0, yawRad: 0 })).toBeNull();
    expect(validatePose({ xM: 1, yM: 0, zM: 0, yawRad: 4 })!.yawRad).toBeCloseTo(4 - 2 * Math.PI);
  });
  it('fits the floor and every object, including one outside the floor', () => {
    const wide = { ...scene, instances: [...scene.instances, rack('rack-3', 25, -4)] };
    const compiled = compileScene(wide, catalog);
    const bounds = sceneBounds(compiled.objects, wide.floor);
    expect(bounds.minX).toBe(0);
    expect(bounds.minY).toBeLessThan(-4);
    expect(bounds.maxX).toBeGreaterThan(25);
    expect(bounds.maxY).toBe(12);
    const camera = fitCamera(bounds, { width: 800, height: 600 });
    for (const corner of [[bounds.minX, bounds.minY], [bounds.maxX, bounds.maxY]] as [number, number][]) {
      const [sx, sy] = worldToScreen(corner, camera, { width: 800, height: 600 });
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(800);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThanOrEqual(600);
    }
    const round = screenToWorld(worldToScreen([3, 4], camera, { width: 800, height: 600 }), camera, { width: 800, height: 600 });
    expect(round[0]).toBeCloseTo(3);
    expect(round[1]).toBeCloseTo(4);
  });
  it('detects footprint overlap for a preview and ignores the moved object itself', () => {
    const compiled = compileScene(scene, catalog);
    const one = compiled.objects.find((o) => o.instanceId === 'rack-1')!;
    const local = localPolygon(one);
    expect(local.every(([x, y]) => Math.abs(x) <= 1.35 + 1e-9 && Math.abs(y) <= 0.55 + 1e-9)).toBe(true);
    expect(polygonsOverlap([[0, 0], [1, 0], [1, 1], [0, 1]], [[2, 2], [3, 2], [3, 3], [2, 3]])).toBe(false);
    expect(polygonsOverlap([[0, 0], [1, 0], [1, 1], [0, 1]], [[0.5, 0.5], [3, 0.5], [3, 3], [0.5, 3]])).toBe(true);
    expect(collidingIds(compiled.objects, 'rack-1', { xM: 3, yM: 2, zM: 0, yawRad: 0 })).toEqual([]);
    expect(collidingIds(compiled.objects, 'rack-1', { xM: 7.5, yM: 2, zM: 0, yawRad: 0 })).toEqual(['rack-2']);
  });
});

describe('action builders', () => {
  it('places from catalog defaults with unverified dimensions and no sources', () => {
    const action = placeAction('scene-1', rackEntry, 'rack-bay-1', { xM: 1, yM: 1, zM: 0, yawRad: 0 });
    expect(action).toEqual({ kind: 'place', sceneId: 'scene-1', instance: { id: 'rack-bay-1', asset, pose: { xM: 1, yM: 1, zM: 0, yawRad: 0 }, dimensions: { state: 'unverified', value: { lengthM: 2.7, widthM: 1.1, heightM: 6 }, sourceIds: [] }, sourceIds: [] } });
    expect(nextInstanceId(rackEntry.id, new Set(['rack-bay-1', 'rack-bay-2']))).toBe('rack-bay-3');
  });
  it('bootstraps activation, scene definition and asset registration in one envelope', () => {
    const actions = bootstrapActions('scene-1', 'Receiving', [asset]);
    expect(actions.map((a) => a.kind)).toEqual(['activate', 'define-scene', 'register-asset']);
    const envelope = envelopeFor({ sourceRevision: 'rev-1', sourceHash: 'h' }, 'Create scene', actions);
    expect(envelope.mutationId).toMatch(/^[A-Za-z0-9][A-Za-z0-9.:_-]{0,127}$/);
    expect(envelopeFor({ sourceRevision: 'rev-1', sourceHash: 'h' }, 'x', actions).mutationId).not.toBe(envelope.mutationId);
  });
  it('detects a delayed action bound to an older base as stale by comparing revisions', () => {
    const envelope = envelopeFor({ sourceRevision: 'rev-1', sourceHash: 'h-rev-1' }, 'Move rack', [{ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM: 4, yM: 2, zM: 0, yawRad: 0 } }]);
    expect(isStale(envelope, { sourceRevision: 'rev-1', sourceHash: 'h-rev-1' })).toBe(false);
    expect(isStale(envelope, { sourceRevision: 'rev-2', sourceHash: 'h-rev-2' })).toBe(true);
    expect(isStale(envelope, { sourceRevision: 'rev-1', sourceHash: 'other' })).toBe(true);
  });
});
