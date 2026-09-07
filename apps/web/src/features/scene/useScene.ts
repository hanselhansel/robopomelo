import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Scene, SpatialAction } from '@robopomelo/spec';
import { api, ApiError, errorMessage } from '../../lib/api.js';
import { bootstrapActions, describeAction, envelopeFor, nextInstanceId, placeAction, removeAction, SPATIAL_CAPABILITY_ID, type CatalogEntryView, type SourceBase } from './actions.js';
import { SceneStore, type SceneResponse, type SceneState } from './scene-store.js';
import { snapPose } from './transforms.js';
export type Pending = { actions: SpatialAction[]; purpose: string };
export type Conflict = { message: string; pending: Pending | null };
export interface SceneApi {
  store: SceneStore; state: SceneState; catalog: CatalogEntryView[]; activated: boolean; loading: boolean; hasScene: boolean;
  error: string | null; conflict: Conflict | null; busy: boolean;
  /** Settled text for the single live region: committed outcomes only, never preview pixels. */
  announcement: string;
  reload(): Promise<void>;
  commit(actions: SpatialAction[], purpose: string): Promise<boolean>;
  commitPreview(): Promise<void>;
  retryPending(): Promise<void>;
  discardPending(): void;
  undo(): Promise<void>;
  place(entry: CatalogEntryView): Promise<void>;
  remove(id: string): Promise<void>;
  createScene(): Promise<void>;
}
type ScenesList = { scenes: { id: string; name: string; floor: Scene['floor']; instanceCount: number }[] };
type Capabilities = { activated: string[] };
type Catalog = { entries: CatalogEntryView[] };
type ProjectRead = { kind: 'readable'; snapshot: SourceBase } | { kind: 'inspection' };
const DEFAULT_SCENE = { id: 'scene-1', name: 'Main floor' };
/** Loads the first scene with its compiled geometry and commits every edit as a
 * base-bound spatial envelope. A stale base never applies; it becomes a visible
 * conflict whose pending action the user can retry against the reloaded base. */
export function useScene(store?: SceneStore): SceneApi {
  const [own] = useState(() => store ?? new SceneStore());
  const state = useSyncExternalStore(own.subscribe, own.getSnapshot);
  const [catalog, setCatalog] = useState<CatalogEntryView[]>([]);
  const [activated, setActivated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasScene, setHasScene] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const reload = useCallback(async () => {
    try {
      const list = await api.request<ScenesList>('/api/scenes');
      const first = list.scenes[0];
      if (!alive.current) return;
      if (!first) { own.clear(); setHasScene(false); return; }
      const response = await api.request<SceneResponse>(`/api/scenes/${encodeURIComponent(first.id)}`);
      if (!alive.current) return;
      own.load(response);
      setHasScene(true);
      setError(null);
    } catch (cause) {
      if (alive.current) setError(errorMessage(cause));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [own]);
  useEffect(() => {
    void reload();
    void api.request<Capabilities>('/api/capabilities').then((c) => alive.current && setActivated(c.activated.includes(SPATIAL_CAPABILITY_ID))).catch((e) => alive.current && setError(errorMessage(e)));
    void api.request<Catalog>('/api/catalog', undefined, false).then((c) => alive.current && setCatalog(c.entries)).catch((e) => alive.current && setError(errorMessage(e)));
  }, [reload]);
  const send = useCallback(async (actions: SpatialAction[], purpose: string, base: SourceBase | null, options: { record: boolean; keepPending: boolean }) => {
    if (!actions.length || !base) return false;
    setBusy(true);
    try {
      await api.request('/api/scenes/actions', envelopeFor(base, purpose, actions));
      if (options.record) own.recordUndo(actions, purpose);
      await reload();
      if (!alive.current) return true;
      setConflict(null);
      setAnnouncement(actions.map((a) => describeAction(a, (id) => id)).join(' '));
      return true;
    } catch (cause) {
      if (!alive.current) return false;
      if (cause instanceof ApiError && cause.code === 'STALE_BASE') {
        setConflict({ message: `${cause.message} The scene was reloaded and your change was not applied.`, pending: options.keepPending ? { actions, purpose } : null });
        await reload();
      } else setError(errorMessage(cause));
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [own, reload]);
  const commit = useCallback((actions: SpatialAction[], purpose: string) => send(actions, purpose, own.state.base, { record: true, keepPending: true }), [own, send]);
  const commitPreview = useCallback(async () => {
    const id = own.state.preview?.id, actions = own.commitPreview();
    if (actions.length) await commit(actions, actions.some((a) => a.kind === 'resize') && actions.length === 1 ? `Resize ${id}` : `Move ${id}`);
  }, [own, commit]);
  const retryPending = useCallback(async () => {
    const pending = conflict?.pending;
    if (!pending) return;
    setConflict(null);
    await commit(pending.actions, pending.purpose);
  }, [conflict, commit]);
  const discardPending = useCallback(() => setConflict(null), []);
  const undo = useCallback(async () => {
    const entry = own.peekUndo();
    if (!entry) return;
    const problem = own.undoConflict();
    if (problem) { setConflict({ message: problem, pending: null }); return; }
    own.popUndo();
    await send([entry.inverse], `Undo: ${entry.label}`, own.state.base, { record: false, keepPending: false });
  }, [own, send]);
  const place = useCallback(async (entry: CatalogEntryView) => {
    const scene = own.state.scene;
    if (!scene) return;
    const id = nextInstanceId(entry.id, new Set(scene.instances.map((i) => i.id)));
    const camera = own.state.camera;
    const pose = snapPose({ xM: camera.centerX, yM: camera.centerY, zM: 0, yawRad: 0 }, own.state.snap);
    if (await commit([placeAction(scene.id, entry, id, pose)], `Place ${entry.title}`)) own.select(id);
  }, [own, commit]);
  const remove = useCallback(async (id: string) => {
    const scene = own.state.scene;
    if (scene) await commit([removeAction(scene.id, id)], `Remove ${id}`);
  }, [own, commit]);
  const createScene = useCallback(async () => {
    try {
      const read = await api.request<ProjectRead>('/api/project');
      if (read.kind !== 'readable') { setError('The project source is not readable right now. Fix it before creating a scene.'); return; }
      const actions = activated ? bootstrapActions(DEFAULT_SCENE.id, DEFAULT_SCENE.name, []).slice(1) : bootstrapActions(DEFAULT_SCENE.id, DEFAULT_SCENE.name, []);
      if (await send(actions, 'Create the first scene', read.snapshot, { record: false, keepPending: false })) setActivated(true);
    } catch (cause) {
      if (alive.current) setError(errorMessage(cause));
    }
  }, [activated, send]);
  return { store: own, state, catalog, activated, loading, hasScene, error, conflict, busy, announcement, reload, commit, commitPreview, retryPending, discardPending, undo, place, remove, createScene };
}
