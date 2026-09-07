import * as THREE from 'three';
import type { Scene } from '@robopomelo/spec';
import type { CompiledObject, CompiledScene, Point } from '@robopomelo/spatial';
import type { CameraState, Preview } from './scene-store.js';
import { floorBounds, localPolygon, type Viewport } from './transforms.js';
/** Three.js scene graph derived from compiler output. Meshes are keyed by stable
 * instance id and rebuilt only when their compiled object changes. Both cameras
 * read the same graph; nothing here is a source of truth for scene data. */
export type RendererLike = {
  domElement: HTMLCanvasElement;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(ratio: number): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  dispose(): void;
};
export type CreateRenderer = (canvas: HTMLCanvasElement) => RendererLike;
export const createWebGLRenderer: CreateRenderer = (canvas) => new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
const COLORS = { base: 0xb9c6b3, robot: 0x8fa9c4, selected: 0x315345, colliding: 0xd9705b, floor: 0xf3eee2, grid: 0xd8ddd1 };
const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
export class SceneGraph {
  readonly root = new THREE.Scene();
  readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  readonly persp = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  private readonly meshes = new Map<string, { mesh: THREE.Mesh; source: CompiledObject }>();
  private readonly objectGroup = new THREE.Group();
  private floorGroup = new THREE.Group();
  private floorKey = '';
  private readonly materials = { base: material(COLORS.base), robot: material(COLORS.robot), selected: material(COLORS.selected), colliding: material(COLORS.colliding) };
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  constructor() {
    this.root.add(new THREE.HemisphereLight(0xffffff, 0x9aa38f, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(-8, -12, 20);
    this.root.add(sun, this.objectGroup, this.floorGroup);
    this.ortho.up.set(0, 1, 0);
    this.persp.up.set(0, 0, 1);
  }
  /** Rebuilds meshes for changed objects and the floor when its extents change. */
  sync(compiled: CompiledScene | null, floor: Scene['floor'] | null): void {
    const seen = new Set<string>();
    for (const object of compiled?.objects ?? []) {
      seen.add(object.instanceId);
      const existing = this.meshes.get(object.instanceId);
      if (existing?.source === object) continue;
      if (existing) { this.objectGroup.remove(existing.mesh); existing.mesh.geometry.dispose(); }
      const mesh = this.buildMesh(object);
      this.meshes.set(object.instanceId, { mesh, source: object });
      this.objectGroup.add(mesh);
    }
    for (const [id, entry] of this.meshes) if (!seen.has(id)) { this.objectGroup.remove(entry.mesh); entry.mesh.geometry.dispose(); this.meshes.delete(id); }
    const bounds = floor ? floorBounds(floor) : null;
    const key = bounds ? `${bounds.maxX}x${bounds.maxY}` : 'none';
    if (key !== this.floorKey) { this.floorKey = key; this.rebuildFloor(bounds ? [bounds.maxX, bounds.maxY] : null); }
  }
  private buildMesh(object: CompiledObject): THREE.Mesh {
    const shape = new THREE.Shape(localPolygon(object).map(([x, y]) => new THREE.Vector2(x, y)));
    const depth = Math.max(object.collision.zMaxM - object.collision.zMinM, 0.01);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    const mesh = new THREE.Mesh(geometry, object.driveOriginOffsetM ? this.materials.robot : this.materials.base);
    mesh.userData = { instanceId: object.instanceId, zOffset: object.collision.zMinM - object.display.pose.zM };
    this.placeMesh(mesh, object.display.pose, null, object);
    return mesh;
  }
  private placeMesh(mesh: THREE.Mesh, pose: { xM: number; yM: number; zM: number; yawRad: number }, extents: Preview['extents'], object: CompiledObject): void {
    mesh.position.set(pose.xM, pose.yM, pose.zM + (mesh.userData.zOffset as number));
    mesh.rotation.set(0, 0, pose.yawRad);
    const size = object.display.sizeM;
    if (extents) mesh.scale.set(extents.lengthM / size.lengthM, extents.widthM / size.widthM, extents.heightM / size.heightM);
    else mesh.scale.set(1, 1, 1);
  }
  private rebuildFloor(size: Point | null): void {
    this.root.remove(this.floorGroup);
    this.floorGroup = new THREE.Group();
    const [length, width] = size ?? [40, 40];
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(length, width), new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 1 }));
    plane.position.set(size ? length / 2 : 0, size ? width / 2 : 0, -0.02);
    plane.userData = { floor: true };
    const grid = new THREE.GridHelper(Math.max(length, width), Math.max(length, width), COLORS.grid, COLORS.grid);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(plane.position.x, plane.position.y, -0.01);
    this.floorGroup.add(plane, grid);
    this.root.add(this.floorGroup);
  }
  /** Applies the transient preview and highlight materials. Canonical meshes stay where the compiler put them. */
  applyPreview(preview: Preview | null, selectedId: string | null, colliding: readonly string[]): void {
    for (const [id, { mesh, source }] of this.meshes) {
      const previewed = preview?.id === id;
      this.placeMesh(mesh, previewed ? preview.pose : source.display.pose, previewed ? preview.extents : null, source);
      mesh.material = colliding.includes(id) || (previewed && colliding.length) ? this.materials.colliding : id === selectedId ? this.materials.selected : source.driveOriginOffsetM ? this.materials.robot : this.materials.base;
    }
  }
  camera(state: CameraState): THREE.Camera { return state.mode === '3d' ? this.persp : this.ortho; }
  updateCameras(state: CameraState, viewport: Viewport): void {
    const width = Math.max(viewport.width, 1), height = Math.max(viewport.height, 1);
    const halfW = width / (2 * state.pxPerM), halfH = height / (2 * state.pxPerM);
    this.ortho.left = -halfW; this.ortho.right = halfW; this.ortho.top = halfH; this.ortho.bottom = -halfH;
    this.ortho.position.set(state.centerX, state.centerY, 500);
    this.ortho.lookAt(state.centerX, state.centerY, 0);
    this.ortho.updateProjectionMatrix();
    const pitch = Math.min(Math.max(state.orbitPitch, 0.05), Math.PI / 2 - 0.05);
    this.persp.aspect = width / height;
    this.persp.position.set(
      state.centerX + state.distanceM * Math.cos(pitch) * Math.cos(state.orbitYaw),
      state.centerY + state.distanceM * Math.cos(pitch) * Math.sin(state.orbitYaw),
      state.distanceM * Math.sin(pitch),
    );
    this.persp.lookAt(state.centerX, state.centerY, 0);
    this.persp.updateProjectionMatrix();
  }
  /** Stable id of the object under a normalized device coordinate, or null. */
  pick(ndc: Point, camera: THREE.Camera): string | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndc[0], ndc[1]), camera);
    const hit = this.raycaster.intersectObjects([...this.meshes.values()].map((m) => m.mesh), false)[0];
    return hit ? String(hit.object.userData.instanceId) : null;
  }
  /** World point on the z = 0 ground plane under a normalized device coordinate. */
  groundPoint(ndc: Point, camera: THREE.Camera): Point | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndc[0], ndc[1]), camera);
    const target = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, target) ? [target.x, target.y] : null;
  }
  render(renderer: RendererLike, state: CameraState): void { renderer.render(this.root, this.camera(state)); }
  dispose(): void {
    for (const { mesh } of this.meshes.values()) mesh.geometry.dispose();
    this.meshes.clear();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
