import type { Extents, Instance, Pose, RequirementBinding, Scene, SpatialAction } from '@robopomelo/spec';
import type { CompiledObject, CompiledScene } from '@robopomelo/spatial';
import { moveAction, resizeAction, type SourceBase } from './actions.js';
import { DEFAULT_SNAP, samePose, snapPose, snapValue, validatePose, type Snap, type TopDownCamera } from './transforms.js';
/** Pure editor state. Canonical scene data comes only from the server; the
 * preview is a transient transform that is either committed as actions or
 * cancelled. Camera state is view state and never part of deployment intent. */
export type SceneResponse = { scene: Scene; compiled: CompiledScene; bindings: RequirementBinding[] } & SourceBase;
export type ViewMode = 'top-down' | '3d';
export type CameraState = TopDownCamera & { mode: ViewMode; orbitYaw: number; orbitPitch: number; distanceM: number };
export type Preview = { id: string; baseline: Instance; pose: Pose; extents: Extents | null };
export type UndoEntry = { id: string; inverse: SpatialAction; after: Instance | null; label: string };
export type SceneState = {
  scene: Scene | null; compiled: CompiledScene | null; bindings: RequirementBinding[]; base: SourceBase | null;
  selectedId: string | null; preview: Preview | null; snap: Snap; camera: CameraState; undo: UndoEntry[];
};
const initialCamera = (): CameraState => ({ mode: 'top-down', centerX: 0, centerY: 0, pxPerM: 40, orbitYaw: Math.PI / 4, orbitPitch: Math.PI / 5, distanceM: 30 });
const extentsOf = (instance: Instance): Extents | null => (instance.dimensions.state === 'known' || instance.dimensions.state === 'unverified' ? { ...instance.dimensions.value } : null);
const sameExtents = (a: Extents | null, b: Extents | null): boolean => (!a || !b ? a === b : a.lengthM === b.lengthM && a.widthM === b.widthM && a.heightM === b.heightM);
const sameInstanceState = (a: Instance, b: Instance): boolean => samePose(a.pose, b.pose) && JSON.stringify(a.dimensions) === JSON.stringify(b.dimensions);
/** Applies one action to a single instance for undo bookkeeping. Null means removed or unaffected. */
export function applyAction(instance: Instance | null, action: SpatialAction): Instance | null {
  switch (action.kind) {
    case 'place': return action.instance;
    case 'move': return instance ? { ...instance, pose: action.pose } : null;
    case 'resize': return instance ? { ...instance, dimensions: action.dimensions } : null;
    case 'remove': return null;
    default: return instance;
  }
}
/** The base-bound reverse of an action, or null when the previous state is unknown. */
export function inverseOf(action: SpatialAction, before: Instance | null): SpatialAction | null {
  switch (action.kind) {
    case 'move': return before ? moveAction(action.sceneId, action.id, before.pose) : null;
    case 'resize': return before ? resizeAction(action.sceneId, action.id, before.dimensions) : null;
    case 'place': return { kind: 'remove', sceneId: action.sceneId, id: action.instance.id, replacementId: null };
    case 'remove': return before ? { kind: 'place', sceneId: action.sceneId, instance: before } : null;
    default: return null;
  }
}
const subjectOf = (action: SpatialAction): string | null => (action.kind === 'place' ? action.instance.id : action.kind === 'move' || action.kind === 'resize' || action.kind === 'remove' ? action.id : null);
export class SceneStore {
  state: SceneState = { scene: null, compiled: null, bindings: [], base: null, selectedId: null, preview: null, snap: DEFAULT_SNAP, camera: initialCamera(), undo: [] };
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = (): SceneState => this.state;
  private set(patch: Partial<SceneState>): void { this.state = { ...this.state, ...patch }; for (const l of this.listeners) l(); }
  load(response: SceneResponse): void {
    const ids = new Set(response.scene.instances.map((i) => i.id));
    this.set({
      scene: response.scene, compiled: response.compiled, bindings: response.bindings, base: { sourceRevision: response.sourceRevision, sourceHash: response.sourceHash },
      selectedId: this.state.selectedId && ids.has(this.state.selectedId) ? this.state.selectedId : null,
      preview: this.state.preview && ids.has(this.state.preview.id) ? this.state.preview : null,
    });
  }
  clear(): void { this.set({ scene: null, compiled: null, bindings: [], base: null, selectedId: null, preview: null, undo: [] }); }
  instance(id: string | null): Instance | null { return (id && this.state.scene?.instances.find((i) => i.id === id)) || null; }
  object(id: string | null): CompiledObject | null { return (id && this.state.compiled?.objects.find((o) => o.instanceId === id)) || null; }
  select(id: string | null): void { if (id !== this.state.selectedId) { if (this.state.preview && this.state.preview.id !== id) this.cancelPreview(); this.set({ selectedId: id && this.instance(id) ? id : null }); } }
  setView(mode: ViewMode): void { this.set({ camera: { ...this.state.camera, mode } }); }
  setCamera(camera: Partial<CameraState>): void { this.set({ camera: { ...this.state.camera, ...camera } }); }
  setSnap(snap: Snap): void { this.set({ snap }); }
  effectivePose(id: string): Pose { const p = this.state.preview; return p && p.id === id ? p.pose : (this.instance(id)?.pose ?? { xM: 0, yM: 0, zM: 0, yawRad: 0 }); }
  effectiveExtents(id: string): Extents | null { const p = this.state.preview; return p && p.id === id ? p.extents : extentsOf(this.instance(id) ?? { dimensions: { state: 'unknown', reason: '' } } as Instance); }
  beginPreview(id: string): boolean {
    if (this.state.preview?.id === id) return true;
    const baseline = this.instance(id);
    if (!baseline) return false;
    this.set({ preview: { id, baseline, pose: { ...baseline.pose }, extents: extentsOf(baseline) }, selectedId: id });
    return true;
  }
  /** Applies a partial pose or extents update, snapped to the configured increments. */
  updatePreview(patch: Partial<Pose & Extents>): void {
    const p = this.state.preview;
    if (!p) return;
    const pose = validatePose({ xM: patch.xM ?? p.pose.xM, yM: patch.yM ?? p.pose.yM, zM: patch.zM ?? p.pose.zM, yawRad: patch.yawRad ?? p.pose.yawRad });
    if (!pose) return;
    let extents = p.extents;
    if (p.extents && (patch.lengthM !== undefined || patch.widthM !== undefined || patch.heightM !== undefined)) {
      const next = { lengthM: patch.lengthM ?? p.extents.lengthM, widthM: patch.widthM ?? p.extents.widthM, heightM: patch.heightM ?? p.extents.heightM };
      if (Object.values(next).every((v) => Number.isFinite(v) && v > 0)) extents = { lengthM: snapValue(next.lengthM, this.state.snap.positionM), widthM: snapValue(next.widthM, this.state.snap.positionM), heightM: snapValue(next.heightM, this.state.snap.positionM) };
    }
    this.set({ preview: { ...p, pose: snapPose(pose, this.state.snap), extents } });
  }
  /** Keyboard nudge in whole snap cells; Shift multiplies by ten. Starts a preview for the selection. */
  nudge(dx: number, dy: number, shift: boolean): void {
    const id = this.state.preview?.id ?? this.state.selectedId;
    if (!id || !this.beginPreview(id)) return;
    const step = this.state.snap.positionM * (shift ? 10 : 1), pose = this.state.preview!.pose;
    this.updatePreview({ xM: pose.xM + dx * step, yM: pose.yM + dy * step });
  }
  rotate(steps: number, shift: boolean): void {
    const id = this.state.preview?.id ?? this.state.selectedId;
    if (!id || !this.beginPreview(id)) return;
    this.updatePreview({ yawRad: this.state.preview!.pose.yawRad + steps * this.state.snap.angleRad * (shift ? 10 : 1) });
  }
  cancelPreview(): void { if (this.state.preview) this.set({ preview: null }); }
  /** Ends the preview and returns at most one move and one resize action; a drag yields exactly one. */
  commitPreview(): SpatialAction[] {
    const p = this.state.preview, sceneId = this.state.scene?.id;
    if (!p || !sceneId) return [];
    const actions: SpatialAction[] = [];
    if (!samePose(p.pose, p.baseline.pose)) actions.push(moveAction(sceneId, p.id, p.pose));
    const before = extentsOf(p.baseline);
    if (p.extents && before && !sameExtents(p.extents, before) && (p.baseline.dimensions.state === 'known' || p.baseline.dimensions.state === 'unverified'))
      actions.push(resizeAction(sceneId, p.id, { state: p.baseline.dimensions.state, value: p.extents, sourceIds: p.baseline.dimensions.sourceIds }));
    this.set({ preview: null });
    return actions;
  }
  /** Records inverse actions against the scene as it was before the commit. */
  recordUndo(actions: SpatialAction[], label = 'Undo'): void {
    const entries: UndoEntry[] = [];
    for (const action of actions) {
      const id = subjectOf(action);
      if (!id) continue;
      const before = this.instance(id), inverse = inverseOf(action, before);
      if (inverse) entries.push({ id, inverse, after: applyAction(before, action), label });
    }
    if (entries.length) this.set({ undo: [...this.state.undo, ...entries.reverse()] });
  }
  peekUndo(): UndoEntry | null { return this.state.undo[this.state.undo.length - 1] ?? null; }
  popUndo(): UndoEntry | null { const entry = this.peekUndo(); if (entry) this.set({ undo: this.state.undo.slice(0, -1) }); return entry; }
  /** Explains why the newest undo entry cannot be applied blindly, or null when the object is unchanged. */
  undoConflict(): string | null {
    const entry = this.peekUndo();
    if (!entry) return null;
    const current = this.instance(entry.id);
    if (entry.after === null) return current ? `${entry.id} was recreated after it was removed. Review it before undoing.` : null;
    if (!current) return `${entry.id} was removed meanwhile. Undo cannot restore it blindly.`;
    return sameInstanceState(current, entry.after) ? null : `${entry.id} changed meanwhile. Review the current placement instead of reverting it blindly.`;
  }
}
