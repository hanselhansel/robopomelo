import type { RobotProfile } from '@robopomelo/spec';
import { activeFootprint, applyPrimitive } from './motion.js';
import { polygonsOverlap, standingPolygon, sweepRotation, sweepTranslation } from './sweep.js';
import { SimulationError, type PathStep, type Polygon, type RobotState, type Tick, type Tolerances } from './types.js';

/** Half-open interval [start, end) on a resource, owned by one robot. `end` may be Infinity (standing until further notice). */
export type Reservation = { resourceId: string; robotId: string; start: Tick; end: Tick };
export type Conflict = { resourceId: string; blockerId: string; end: Tick; candidateStart: Tick };

const CELL_EPS = 1e-9;
export const cellId = (ix: number, iy: number): string => `c:${ix},${iy}`;
/** Directed lattice edge between two cell centers (translate steps). */
export const edgeId = (fromCell: string, toCell: string): string => `e:${fromCell.slice(2)}>${toCell.slice(2)}`;
export const stationResourceId = (stationId: string): string => `s:${stationId}`;
export function reverseEdge(id: string): string {
  const [a, b] = id.slice(2).split('>');
  return `e:${b}>${a}`;
}
export const cellOfPoint = (xM: number, yM: number, gridM: number): string => cellId(Math.round(xM / gridM), Math.round(yM / gridM));

/** Square of a lattice cell (side gridM, centred on the lattice point). */
export function cellSquare(ix: number, iy: number, gridM: number): Polygon {
  const h = gridM / 2, x = ix * gridM, y = iy * gridM;
  return [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]];
}

/** Lattice cells whose square overlaps any of the (convex) polygons. Candidates come
 * from the axis-aligned bounds, then each square is tested exactly with the same
 * separating-axis test the collision checker uses, so a route that clears another
 * robot's cell squares as obstacles also clears its cell reservations. */
export function cellsOf(polygons: readonly Polygon[], gridM: number): string[] {
  const out = new Set<string>();
  for (const polygon of polygons) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of polygon) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const ix0 = Math.ceil((minX + CELL_EPS) / gridM - 0.5), ix1 = Math.ceil((maxX - CELL_EPS) / gridM + 0.5) - 1;
    const iy0 = Math.ceil((minY + CELL_EPS) / gridM - 0.5), iy1 = Math.ceil((maxY - CELL_EPS) / gridM + 0.5) - 1;
    for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) if (polygonsOverlap(cellSquare(ix, iy, gridM), polygon)) out.add(cellId(ix, iy));
  }
  return [...out];
}

/** Bounding rectangle of a set of cells, for use as a conservative obstacle. */
export function cellsBounds(cells: readonly string[], gridM: number): Polygon {
  let ix0 = Infinity, ix1 = -Infinity, iy0 = Infinity, iy1 = -Infinity;
  for (const id of cells) {
    const [ix, iy] = id.slice(2).split(',').map(Number) as [number, number];
    if (ix < ix0) ix0 = ix; if (ix > ix1) ix1 = ix; if (iy < iy0) iy0 = iy; if (iy > iy1) iy1 = iy;
  }
  const h = gridM / 2;
  return [[ix0 * gridM - h, iy0 * gridM - h], [ix1 * gridM + h, iy0 * gridM - h], [ix1 * gridM + h, iy1 * gridM + h], [ix0 * gridM - h, iy1 * gridM + h]];
}

export function standingCells(profile: RobotProfile, state: RobotState, tol: Tolerances): string[] {
  return cellsOf([standingPolygon(activeFootprint(profile, state.loaded), state.pose, tol)], tol.gridM);
}

/** Swept resources of one path step, relative to the path start tick. */
export type StepResources = { cells: string[]; edge: string | null; from: Tick; to: Tick };
export type PathResources = { steps: StepResources[]; finalCells: string[]; arrival: Tick };

/** Swept occupied area per step from the same S4 sweep polygons the collision check
 * uses. A step's interval is [previous arrival, own arrival), widened to at least one
 * tick so a sub-tick step still occupies its cells. */
export function pathResources(profile: RobotProfile, start: RobotState, steps: readonly PathStep[], tol: Tolerances): PathResources {
  const footprint = activeFootprint(profile, start.loaded);
  const out: StepResources[] = [];
  let pose = start.pose, from = 0;
  for (const step of steps) {
    let polygons: Polygon[];
    if (step.primitive.kind === 'translate') polygons = sweepTranslation(footprint, pose, applyPrimitive(pose, step.primitive), tol);
    else {
      const sweep = sweepRotation(footprint, pose, step.primitive.dYawRad, tol);
      if (!sweep.resolved) throw new SimulationError('SWEEP_UNRESOLVED', 'rotation sweep could not be resolved for reservation');
      polygons = sweep.polygons;
    }
    const to = Math.max(step.tick, from + 1);
    const edge = step.primitive.kind === 'translate' ? edgeId(cellOfPoint(pose.xM, pose.yM, tol.gridM), cellOfPoint(step.pose.xM, step.pose.yM, tol.gridM)) : null;
    out.push({ cells: cellsOf(polygons, tol.gridM), edge, from, to });
    pose = step.pose;
    from = to;
  }
  return { steps: out, finalCells: cellsOf([standingPolygon(footprint, pose, tol)], tol.gridM), arrival: from };
}

/** Reservations for a path departing at `startTick`, followed by standing at the goal
 * until `holdEnd`. Cell intervals are merged per cell so a cell is released only when
 * the sweep of the LAST step touching it ends (full-footprint clearance). */
export function pathReservations(robotId: string, res: PathResources, startTick: Tick, holdEnd: Tick): Reservation[] {
  const cells = new Map<string, { start: Tick; end: Tick }>();
  const touch = (id: string, start: Tick, end: Tick): void => {
    const c = cells.get(id);
    if (!c) cells.set(id, { start, end });
    else { if (start < c.start) c.start = start; if (end > c.end) c.end = end; }
  };
  const out: Reservation[] = [];
  for (const step of res.steps) {
    for (const cell of step.cells) touch(cell, startTick + step.from, startTick + step.to);
    if (step.edge) out.push({ resourceId: step.edge, robotId, start: startTick + step.from, end: startTick + step.to });
  }
  for (const cell of res.finalCells) touch(cell, startTick + res.arrival, holdEnd);
  for (const [resourceId, { start, end }] of cells) out.push({ resourceId, robotId, start, end });
  return out;
}

/** Time-indexed reservation table. Cells conflict on any overlap by another robot;
 * directed edges conflict with the opposite direction (no swaps); station resources
 * conflict once `capacity` other robots overlap. */
export class ReservationTable {
  private readonly byResource = new Map<string, Reservation[]>();
  private readonly byRobot = new Map<string, Reservation[]>();
  constructor(private readonly capacities: ReadonlyMap<string, number> = new Map()) {}

  add(reservations: readonly Reservation[]): void {
    for (const r of reservations) {
      if (!Number.isInteger(r.start) || r.start < 0 || !(r.end > r.start)) throw new SimulationError('INVALID_INTERVAL', `reservation ${r.resourceId} [${r.start}, ${r.end}) is not a valid interval`);
      push(this.byResource, r.resourceId, r);
      push(this.byRobot, r.robotId, r);
    }
  }
  clear(robotId: string): void {
    for (const r of this.byRobot.get(robotId) ?? []) {
      const list = this.byResource.get(r.resourceId);
      if (list) { const i = list.indexOf(r); if (i >= 0) list.splice(i, 1); if (list.length === 0) this.byResource.delete(r.resourceId); }
    }
    this.byRobot.delete(robotId);
  }
  ofRobot(robotId: string): readonly Reservation[] { return this.byRobot.get(robotId) ?? []; }
  /** Robots holding a resource at a tick, in insertion order. */
  holdersAt(resourceId: string, tick: Tick): string[] {
    return (this.byResource.get(resourceId) ?? []).filter((r) => r.start <= tick && tick < r.end).map((r) => r.robotId);
  }
  /** Drops reservations that ended before `tick` (bounded memory over long runs). */
  prune(tick: Tick): void {
    for (const [id, list] of this.byResource) {
      const kept = list.filter((r) => r.end > tick);
      if (kept.length === 0) this.byResource.delete(id); else if (kept.length !== list.length) this.byResource.set(id, kept);
    }
    for (const [id, list] of this.byRobot) this.byRobot.set(id, list.filter((r) => r.end > tick));
  }
  /** Every conflict a candidate set would have with other robots' reservations. */
  conflicts(candidates: readonly Reservation[]): Conflict[] {
    const out: Conflict[] = [];
    for (const c of candidates) {
      if (c.resourceId.startsWith('e:')) {
        for (const r of this.overlapping(reverseEdge(c.resourceId), c)) out.push({ resourceId: c.resourceId, blockerId: r.robotId, end: r.end, candidateStart: c.start });
        continue;
      }
      const others = this.overlapping(c.resourceId, c);
      if (c.resourceId.startsWith('s:')) {
        const capacity = this.capacities.get(c.resourceId) ?? 1;
        const distinct = [...new Map(others.map((r) => [r.robotId, r])).values()].sort((a, b) => a.end - b.end);
        if (distinct.length >= capacity) { const r = distinct[distinct.length - capacity]!; out.push({ resourceId: c.resourceId, blockerId: r.robotId, end: r.end, candidateStart: c.start }); }
        continue;
      }
      for (const r of others) out.push({ resourceId: c.resourceId, blockerId: r.robotId, end: r.end, candidateStart: c.start });
    }
    return out;
  }
  private overlapping(resourceId: string, c: Reservation): Reservation[] {
    return (this.byResource.get(resourceId) ?? []).filter((r) => r.robotId !== c.robotId && r.start < c.end && c.start < r.end);
  }
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value); else map.set(key, [value]);
}
