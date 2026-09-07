import { vi } from 'vitest';
import type { Instance, Scene, SpatialAction, SpatialEnvelope } from '@robopomelo/spec';
import { bundledCatalog, compileScene } from '@robopomelo/spatial';
import { api, ApiError } from '../src/lib/api.js';
import type { RendererLike } from '../src/features/scene/SceneCanvas.js';
export const catalog = bundledCatalog();
const rackEntry = catalog.entries.find((e) => e.id === 'rack-bay')!;
export const asset = { id: rackEntry.id, version: rackEntry.version, sha256: rackEntry.sha256 };
const known = <T,>(value: T) => ({ state: 'known' as const, value, sourceIds: ['evidence-plan'] });
export const rack = (id: string, xM: number, yM = 2): Instance => ({ id, asset, pose: { xM, yM, zM: 0, yawRad: 0 }, dimensions: known({ lengthM: 2.7, widthM: 1.1, heightM: 6 }), sourceIds: ['evidence-plan'] });
export const initialScene = (): Scene => ({ id: 'scene-1', name: 'Receiving', floor: known({ lengthM: 20, widthM: 12 }), instances: [rack('rack-1', 3), rack('rack-2', 8)] });
export interface Call { path: string; body: unknown; project: boolean; method: string | undefined }
export interface SceneServer {
  scene: Scene | null;
  revision: number;
  /** Applies committed actions to the in-memory scene. Override to simulate another editor. */
  apply: (envelope: SpatialEnvelope) => unknown;
  calls: Call[];
}
export const applyToScene = (scene: Scene, action: SpatialAction): Scene => {
  if (action.kind === 'move') return { ...scene, instances: scene.instances.map((i) => (i.id === action.id ? { ...i, pose: action.pose } : i)) };
  if (action.kind === 'resize') return { ...scene, instances: scene.instances.map((i) => (i.id === action.id ? { ...i, dimensions: action.dimensions } : i)) };
  if (action.kind === 'place') return { ...scene, instances: [...scene.instances, action.instance] };
  if (action.kind === 'remove') return { ...scene, instances: scene.instances.filter((i) => i.id !== action.id) };
  if (action.kind === 'define-scene') return { ...action.scene, instances: [] };
  return scene;
};
export const stale = () => new ApiError('STALE_BASE', 'The source changed. Review the current and proposed values.', undefined, 409);
/** Routes api.request to an in-memory spatial server that bumps its revision on every commit. */
export function mockSceneServer(scene: Scene | null = initialScene(), overrides: Partial<SceneServer> = {}): SceneServer {
  const server: SceneServer = {
    scene, revision: 1, calls: [],
    apply(envelope) {
      if (envelope.sourceRevision !== `rev-${server.revision}`) throw stale();
      server.scene = envelope.actions.reduce((s, a) => applyToScene(s ?? { id: 'scene-1', name: '', floor: { state: 'unknown', reason: '' }, instances: [] }, a), server.scene);
      server.revision += 1;
      return { kind: 'committed', snapshot: {}, diff: [] };
    },
    ...overrides,
  };
  vi.spyOn(api, 'request').mockImplementation(async (path: string, body?: unknown, project = true, method?: string) => {
    server.calls.push({ path, body, project, method });
    if (path === '/api/capabilities') return { activated: server.scene ? ['spatial-planning-v1'] : [], available: [] };
    if (path === '/api/catalog') return { entries: catalog.entries };
    if (path === '/api/scenes') return { scenes: server.scene ? [{ id: server.scene.id, name: server.scene.name, floor: server.scene.floor, instanceCount: server.scene.instances.length }] : [], scenarios: [], robotProfiles: [], assets: [] };
    if (path.startsWith('/api/scenes/') && path !== '/api/scenes/actions') {
      if (!server.scene) throw new ApiError('RECORD_NOT_FOUND', 'That scene does not exist in this project.', undefined, 404);
      return { scene: server.scene, compiled: compileScene(server.scene, catalog), bindings: [], sourceRevision: `rev-${server.revision}`, sourceHash: `h-rev-${server.revision}` };
    }
    if (path === '/api/scenes/actions') return server.apply(body as SpatialEnvelope);
    if (path === '/api/project') return { kind: 'readable', snapshot: { sourceRevision: `rev-${server.revision}`, sourceHash: `h-rev-${server.revision}` }, externalEdit: false };
    throw new Error(`Unexpected call ${path}`);
  });
  return server;
}
export const commits = (server: SceneServer): SpatialEnvelope[] => server.calls.filter((c) => c.path === '/api/scenes/actions').map((c) => c.body as SpatialEnvelope);
/** WebGL is unavailable in jsdom, so the canvas gets a renderer that only records calls. */
export const stubRenderer = (canvas: HTMLCanvasElement): RendererLike => ({ domElement: canvas, setSize() {}, setPixelRatio() {}, render() {}, dispose() {} });
