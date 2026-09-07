import { useEffect, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { Pose } from '@robopomelo/spec';
import type { Point } from '@robopomelo/spatial';
import type { SceneApi } from './useScene.js';
import { SceneGraph, createWebGLRenderer, type CreateRenderer, type RendererLike } from './scene-graph.js';
import { collidingIds, fitCamera, sceneBounds, type Viewport } from './transforms.js';
export type { CreateRenderer, RendererLike } from './scene-graph.js';
type ObjectDrag = { kind: 'object'; id: string; start: Point; baseline: Pose; moved: boolean };
type CameraDrag = { kind: 'camera'; startX: number; startY: number; centerX: number; centerY: number; orbitYaw: number; orbitPitch: number };
const DRAG_THRESHOLD_PX = 3;
/** WebGL view of the compiled scene. Left drag on an object previews a move and
 * commits once on release; right button, middle button or Space plus drag pans
 * or orbits the camera and never touches objects. */
export function SceneCanvas({ scene, createRenderer = createWebGLRenderer, fitRef }: { scene: SceneApi; createRenderer?: CreateRenderer; fitRef?: MutableRefObject<(() => void) | null> }) {
  const { store, state } = scene;
  const wrapper = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graph = useRef<SceneGraph | null>(null);
  const renderer = useRef<RendererLike | null>(null);
  const viewport = useRef<Viewport>({ width: 0, height: 0 });
  const drag = useRef<ObjectDrag | CameraDrag | null>(null);
  const space = useRef(false);
  const fitted = useRef(false);
  const frame = useRef(0);
  const fit = () => {
    const s = store.state;
    if (!s.compiled || !s.scene) return;
    const camera = fitCamera(sceneBounds(s.compiled.objects, s.scene.floor), viewport.current);
    store.setCamera({ ...camera, distanceM: Math.max(Math.max(viewport.current.width, viewport.current.height) / camera.pxPerM, 5) * 1.2 });
  };
  if (fitRef) fitRef.current = fit;
  useEffect(() => {
    const canvas = canvasRef.current, host = wrapper.current;
    if (!canvas || !host) return;
    const g = new SceneGraph();
    let r: RendererLike | null = null;
    try { r = createRenderer(canvas); } catch (cause) { console.warn('Scene renderer unavailable', cause); }
    graph.current = g;
    renderer.current = r;
    const draw = () => {
      frame.current = 0;
      const s = store.state;
      g.sync(s.compiled, s.scene?.floor ?? null);
      const colliding = s.preview && s.compiled ? collidingIds(s.compiled.objects, s.preview.id, s.preview.pose) : [];
      g.applyPreview(s.preview, s.selectedId, colliding);
      g.updateCameras(s.camera, viewport.current);
      if (r) g.render(r, s.camera);
    };
    const schedule = () => { if (!frame.current && typeof requestAnimationFrame === 'function') frame.current = requestAnimationFrame(draw); };
    const measure = () => {
      const rect = host.getBoundingClientRect();
      viewport.current = { width: Math.max(Math.floor(rect.width), 1), height: Math.max(Math.floor(rect.height), 1) };
      r?.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r?.setSize(viewport.current.width, viewport.current.height, false);
      if (!fitted.current && store.state.compiled) { fitted.current = true; fit(); }
      schedule();
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(host);
    const unsubscribe = store.subscribe(() => { if (!fitted.current && store.state.compiled) { fitted.current = true; fit(); } schedule(); });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' || (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|BUTTON|SELECT)$/.test(event.target.tagName))) return;
      space.current = event.type === 'keydown';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      observer?.disconnect();
      unsubscribe();
      if (frame.current) cancelAnimationFrame(frame.current);
      g.dispose();
      r?.dispose();
      graph.current = null;
      renderer.current = null;
    };
  }, [store, createRenderer]);
  const ndc = (event: ReactPointerEvent): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1, -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1)];
  };
  const ground = (event: ReactPointerEvent): Point | null => (graph.current ? graph.current.groundPoint(ndc(event), graph.current.camera(store.state.camera)) : null);
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!graph.current) return;
    const camera = store.state.camera;
    if (event.button === 2 || event.button === 1 || space.current) {
      drag.current = { kind: 'camera', startX: event.clientX, startY: event.clientY, centerX: camera.centerX, centerY: camera.centerY, orbitYaw: camera.orbitYaw, orbitPitch: camera.orbitPitch };
    } else if (event.button === 0) {
      const id = graph.current.pick(ndc(event), graph.current.camera(camera));
      store.select(id);
      const start = id ? ground(event) : null;
      const baseline = id ? store.instance(id)?.pose : null;
      drag.current = id && start && baseline ? { kind: 'object', id, start, baseline, moved: false } : null;
    }
    if (drag.current) event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'camera') {
      const dx = event.clientX - d.startX, dy = event.clientY - d.startY, camera = store.state.camera;
      if (camera.mode === 'top-down') store.setCamera({ centerX: d.centerX - dx / camera.pxPerM, centerY: d.centerY + dy / camera.pxPerM });
      else store.setCamera({ orbitYaw: d.orbitYaw - dx * 0.008, orbitPitch: Math.min(Math.max(d.orbitPitch + dy * 0.008, 0.1), Math.PI / 2 - 0.1) });
      return;
    }
    const point = ground(event);
    if (!point) return;
    const dx = point[0] - d.start[0], dy = point[1] - d.start[1];
    if (!d.moved && Math.hypot(dx, dy) * store.state.camera.pxPerM < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    if (store.beginPreview(d.id)) store.updatePreview({ xM: d.baseline.xM + dx, yM: d.baseline.yM + dy });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (d?.kind === 'object' && d.moved) void scene.commitPreview();
  };
  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    const camera = store.state.camera, factor = Math.exp(-event.deltaY * 0.0012);
    if (camera.mode === 'top-down') store.setCamera({ pxPerM: Math.min(Math.max(camera.pxPerM * factor, 2), 800) });
    else store.setCamera({ distanceM: Math.min(Math.max(camera.distanceM / factor, 2), 500) });
  };
  const preview = state.preview;
  const colliding = preview && state.compiled ? collidingIds(state.compiled.objects, preview.id, preview.pose) : [];
  return (
    <div ref={wrapper} className={`scene-canvas${preview ? ' previewing' : ''}`} data-view={state.camera.mode}>
      <canvas
        ref={canvasRef}
        aria-label={state.camera.mode === '3d' ? 'Scene, 3D view. Use the object list and inspector for keyboard editing.' : 'Scene, top-down view. Use the object list and inspector for keyboard editing.'}
        role="img"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(event) => event.preventDefault()}
      />
      {preview && (
        <div className={`scene-guide${colliding.length ? ' colliding' : ''}`} aria-hidden="true">
          <span>X {preview.pose.xM.toFixed(2)} m, Y {preview.pose.yM.toFixed(2)} m, {Math.round((preview.pose.yawRad * 180) / Math.PI)} deg</span>
          {colliding.length > 0 && <span>Overlaps {colliding.join(', ')}</span>}
        </div>
      )}
      <p className="scene-hint" aria-hidden="true">Drag an object to move it. Right button or Space plus drag moves the camera. Scroll to zoom.</p>
    </div>
  );
}
