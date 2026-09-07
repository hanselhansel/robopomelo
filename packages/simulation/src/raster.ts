import type { Pose, RobotProfile } from '@robopomelo/spec';
import { activeFootprint, applyPrimitive, checkMove, primitiveFeasible, standingClear, type MoveCheck } from './motion.js';
import type { StaticOracle } from './occupancy.js';
import type { Bounds } from './route.js';
import { polygonsOverlap, standingPolygon, sweepRotation, sweepTranslation, zIntersects } from './sweep.js';
import { robotZInterval, type MotionPrimitive, type Polygon, type RobotState, type StaticObstacle, type Tolerances } from './types.js';
const EPS = 1e-9;
const aligned = (value: number, unit: number): boolean => Math.abs(value / unit - Math.round(value / unit)) < 1e-6;
/** Conservative occupancy of the static scene on a fine grid: a cell is occupied
 * when any obstacle polygon intersects the cell square. Cells store the first
 * obstacle index plus one so a blocked report can still name the obstacle. */
export class OccupancyField {
  readonly cells: Uint16Array;
  /** Cells whose whole square lies inside an obstacle: a definite hit needs no confirmation. */
  readonly inner: Uint16Array;
  readonly nx: number;
  readonly ny: number;
  constructor(readonly cellM: number, readonly x0: number, readonly y0: number, readonly x1: number, readonly y1: number, readonly obstacles: readonly StaticObstacle[]) {
    this.nx = Math.ceil((x1 - x0) / cellM) + 1;
    this.ny = Math.ceil((y1 - y0) / cellM) + 1;
    this.cells = new Uint16Array(this.nx * this.ny);
    this.inner = new Uint16Array(this.nx * this.ny);
    obstacles.forEach((obstacle, index) => {
      const xs = obstacle.polygon.map(([x]) => x), ys = obstacle.polygon.map(([, y]) => y);
      const cx0 = Math.max(0, Math.floor((Math.min(...xs) - x0) / cellM) - 1), cx1 = Math.min(this.nx - 1, Math.ceil((Math.max(...xs) - x0) / cellM) + 1);
      const cy0 = Math.max(0, Math.floor((Math.min(...ys) - y0) / cellM) - 1), cy1 = Math.min(this.ny - 1, Math.ceil((Math.max(...ys) - y0) / cellM) + 1);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const at = cy * this.nx + cx;
        if (this.cells[at]) continue;
        const square = this.square(cx, cy);
        if (polygonsOverlap(square, obstacle.polygon)) {
          this.cells[at] = index + 1;
          if (square.every((point) => insideConvex(point, obstacle.polygon))) this.inner[at] = index + 1;
        }
      }
    });
  }
  square(cx: number, cy: number): Polygon {
    const x = this.x0 + cx * this.cellM, y = this.y0 + cy * this.cellM;
    return [[x, y], [x + this.cellM, y], [x + this.cellM, y + this.cellM], [x, y + this.cellM]];
  }
  /** Cells whose squares intersect the polygon (touch) and cells fully inside it (core), as packed offsets. */
  cover(polygon: Polygon): { touch: Int32Array; core: Int32Array } {
    const xs = polygon.map(([x]) => x), ys = polygon.map(([, y]) => y);
    const cx0 = Math.floor((Math.min(...xs) - EPS) / this.cellM), cx1 = Math.floor((Math.max(...xs) + EPS) / this.cellM);
    const cy0 = Math.floor((Math.min(...ys) - EPS) / this.cellM), cy1 = Math.floor((Math.max(...ys) + EPS) / this.cellM);
    const touch: number[] = [], core: number[] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const x = cx * this.cellM, y = cy * this.cellM;
      const square: Polygon = [[x, y], [x + this.cellM, y], [x + this.cellM, y + this.cellM], [x, y + this.cellM]];
      if (!polygonsOverlap(square, polygon)) continue;
      touch.push(cx, cy);
      if (square.every((point) => insideConvex(point, polygon))) core.push(cx, cy);
    }
    return { touch: Int32Array.from(touch), core: Int32Array.from(core) };
  }
  /** Obstacle hit for a template placed at an origin cell; out-of-field cells count as free space. */
  hit(template: Int32Array, ox: number, oy: number, field: Uint16Array = this.cells): number {
    for (let i = 0; i < template.length; i += 2) {
      const cx = ox + template[i]!, cy = oy + template[i + 1]!;
      if (cx < 0 || cy < 0 || cx >= this.nx || cy >= this.ny) continue;
      const value = field[cy * this.nx + cx]!;
      if (value) return value;
    }
    return 0;
  }
}
type Template = { kind: 'cells'; touch: Int32Array; core: Int32Array } | { kind: 'unresolved'; reason: 'SUBDIVISION_LIMIT' };
/** Point inside (or on the boundary of) a convex polygon in either winding. */
function insideConvex([px, py]: [number, number], polygon: Polygon): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i]!, [bx, by] = polygon[(i + 1) % polygon.length]!;
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (Math.abs(cross) < EPS) continue;
    const current = cross > 0 ? 1 : -1;
    if (sign === 0) sign = current; else if (sign !== current) return false;
  }
  return true;
}
const merge = (parts: { touch: Int32Array; core: Int32Array }[]): { touch: Int32Array; core: Int32Array } => ({ touch: Int32Array.from(parts.flatMap((p) => [...p.touch])), core: Int32Array.from(parts.flatMap((p) => [...p.core])) });
/** Static clearance by rasterized templates. The swept shape of a lattice
 * primitive depends only on heading and load state, so it is rasterized once at
 * the origin and shifted. A raster miss is a sound clear; a raster hit is confirmed
 * by the exact polygon check, so results equal checkMove while most expansions cost
 * only integer lookups. The independent trace checker still validates every path. */
export class RasterOracle implements StaticOracle {
  readonly field: OccupancyField;
  #templates = new Map<string, Template>();
  readonly #yawUnit: number;
  readonly #fine: number;
  constructor(private readonly profile: RobotProfile, obstacles: readonly StaticObstacle[], bounds: Bounds, private readonly tol: Tolerances, fineCellM = tol.gridM / 4, templates?: Map<string, Template>) {
    this.#fine = fineCellM;
    this.#yawUnit = (2 * Math.PI) / tol.yawSteps;
    if (templates) this.#templates = templates;
    const z = robotZInterval(profile, { xM: 0, yM: 0, zM: 0, yawRad: 0 });
    const relevant = obstacles.filter((o) => zIntersects(z, o));
    const reach = Math.max(...profile.footprintM.map(([x, y]) => Math.hypot(x, y)), ...profile.loadedFootprintM.map(([x, y]) => Math.hypot(x, y))) + tol.gridM * 2 + 1;
    this.field = new OccupancyField(fineCellM, bounds.minXM - reach, bounds.minYM - reach, bounds.maxXM + reach, bounds.maxYM + reach, relevant);
    this.#all = obstacles;
  }
  readonly #all: readonly StaticObstacle[];
  /** A checker for a small dynamic set (other robots) over its own bounding box, sharing the templates. */
  forExtras(obstacles: readonly StaticObstacle[]): StaticOracle {
    const xs = obstacles.flatMap((o) => o.polygon.map(([x]) => x)), ys = obstacles.flatMap((o) => o.polygon.map(([, y]) => y));
    const bounds: Bounds = { minXM: Math.min(...xs), maxXM: Math.max(...xs), minYM: Math.min(...ys), maxYM: Math.max(...ys) };
    const field = new RasterOracle(this.profile, obstacles, bounds, this.tol, this.#fine, this.#templates);
    // Poses whose origin cell falls outside this small field cannot touch the extras; hit() treats them as free.
    return field;
  }
  #origin(state: RobotState): { ox: number; oy: number; iyaw: number } | null {
    if (!aligned(state.pose.xM, this.#fine) || !aligned(state.pose.yM, this.#fine) || !aligned(state.pose.yawRad, this.#yawUnit)) return null;
    return { ox: Math.round((state.pose.xM - this.field.x0) / this.#fine), oy: Math.round((state.pose.yM - this.field.y0) / this.#fine), iyaw: ((Math.round(state.pose.yawRad / this.#yawUnit) % this.tol.yawSteps) + this.tol.yawSteps) % this.tol.yawSteps };
  }
  #template(key: string, build: () => Template): Template {
    let template = this.#templates.get(key);
    if (!template) { template = build(); this.#templates.set(key, template); }
    return template;
  }
  /** No touching occupied cell is a sound clear; a core cell fully inside an obstacle is a
   * definite hit; anything else is a boundary case confirmed by the exact polygon check. */
  #decide(template: { touch: Int32Array; core: Int32Array }, ox: number, oy: number, exact: () => MoveCheck): MoveCheck {
    if (!this.field.hit(template.touch, ox, oy)) return { kind: 'clear' };
    const definite = this.field.hit(template.core, ox, oy, this.field.inner);
    return definite ? { kind: 'blocked', obstacleId: this.field.obstacles[definite - 1]!.id } : exact();
  }
  check(state: RobotState, primitive: MotionPrimitive): MoveCheck {
    const origin = this.#origin(state);
    if (!origin) return checkMove(this.profile, state, primitive, this.#all, this.tol);
    if (!primitiveFeasible(this.profile, state.pose, primitive)) return { kind: 'infeasible', reason: 'DRIVE_CONSTRAINT' };
    const footprint = activeFootprint(this.profile, state.loaded);
    const local: Pose = { xM: 0, yM: 0, zM: 0, yawRad: origin.iyaw * this.#yawUnit };
    const key = `${state.loaded ? 'L' : 'E'}|${origin.iyaw}|${primitive.kind === 'translate' ? `t${Math.round(primitive.dxM / this.#fine)},${Math.round(primitive.dyM / this.#fine)}` : `r${Math.round(primitive.dYawRad / this.#yawUnit)}`}`;
    const template = this.#template(key, () => {
      if (primitive.kind === 'translate') return { kind: 'cells', ...this.field.cover(sweepTranslation(footprint, local, applyPrimitive(local, primitive), this.tol)[0]!) };
      const sweep = sweepRotation(footprint, local, primitive.dYawRad, this.tol);
      if (!sweep.resolved) return { kind: 'unresolved', reason: sweep.reason };
      return { kind: 'cells', ...merge(sweep.polygons.map((polygon) => this.field.cover(polygon))) };
    });
    if (template.kind === 'unresolved') return { kind: 'unresolved', reason: template.reason };
    return this.#decide(template, origin.ox, origin.oy, () => checkMove(this.profile, state, primitive, this.#all, this.tol));
  }
  standing(state: RobotState): MoveCheck {
    const origin = this.#origin(state);
    if (!origin) return standingClear(this.profile, state.pose, state.loaded, this.#all, this.tol);
    const template = this.#template(`${state.loaded ? 'L' : 'E'}|${origin.iyaw}|stand`, () => ({ kind: 'cells', ...this.field.cover(standingPolygon(activeFootprint(this.profile, state.loaded), { xM: 0, yM: 0, zM: 0, yawRad: origin.iyaw * this.#yawUnit }, this.tol)) }));
    return template.kind === 'unresolved' ? { kind: 'unresolved', reason: template.reason } : this.#decide(template, origin.ox, origin.oy, () => standingClear(this.profile, state.pose, state.loaded, this.#all, this.tol));
  }
}
