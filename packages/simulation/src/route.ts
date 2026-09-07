import type { Pose, RobotProfile } from '@robopomelo/spec';
import { secondsFor, ticksForSeconds } from './clock.js';
import { assertDrive, checkMove, primitiveSeconds, standingClear } from './motion.js';
import { SimulationError, type MotionPrimitive, type PathStep, type RobotState, type StaticObstacle, type Tick, type Tolerances } from './types.js';

export type Bounds = { minXM: number; maxXM: number; minYM: number; maxYM: number };
export type RouteTransition = 'none' | 'load' | 'unload';
export type RouteGoal = { pose: Pose; transition: RouteTransition };
export type RouteOptions = { bounds: Bounds; tolerances: Tolerances; expansionLimit?: number };
export const DEFAULT_EXPANSION_LIMIT = 20000;
export type InfeasibleReason = 'EXHAUSTED' | 'START_BLOCKED' | 'GOAL_BLOCKED' | 'STATION_CLEARANCE';
export type RouteResult =
  | { kind: 'path'; start: Pose; steps: PathStep[]; ticks: Tick; expansions: number }
  | { kind: 'infeasible'; reason: InfeasibleReason; obstacleId: string | null; expansions: number }
  | { kind: 'unresolved'; reason: 'EXPANSION_LIMIT' | 'SWEEP_BOUND'; expansions: number };

const LATTICE_EPS = 1e-6;
const SECONDS_EPS = 1e-9;
type Node = { key: string; ix: number; iy: number; iyaw: number; seconds: number; tick: Tick; f: Tick; parent: Node | null; primitive: MotionPrimitive | null };

/** Lattice index of a coordinate, or a typed error when the pose is off-lattice. */
function index(value: number, unit: number, what: string): number {
  const i = Math.round(value / unit);
  if (Math.abs(value - i * unit) > LATTICE_EPS) throw new SimulationError('OFF_LATTICE', `${what} ${value} is not on the ${unit} lattice`);
  return i;
}

/** Unit heading vectors in grid cells for each discrete yaw index. */
function headings(yawSteps: number): [number, number][] {
  if (yawSteps !== 4 && yawSteps !== 8) throw new SimulationError('UNSUPPORTED_YAW_STEPS', `yawSteps ${yawSteps} is not 4 or 8`);
  return Array.from({ length: yawSteps }, (_, k) => [Math.round(Math.cos((2 * Math.PI * k) / yawSteps)), Math.round(Math.sin((2 * Math.PI * k) / yawSteps))]);
}

class Heap {
  private items: Node[] = [];
  constructor(private readonly less: (a: Node, b: Node) => boolean) {}
  get size(): number { return this.items.length; }
  push(node: Node): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(items[i]!, items[parent]!)) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }
  pop(): Node {
    const items = this.items, top = items[0]!, last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let best = i;
        if (l < items.length && this.less(items[l]!, items[best]!)) best = l;
        if (r < items.length && this.less(items[r]!, items[best]!)) best = r;
        if (best === i) break;
        [items[i], items[best]] = [items[best]!, items[i]!];
        i = best;
      }
    }
    return top;
  }
}

/** Total order: lower f first, then higher g (deeper), then the stable pose key. */
const before = (a: Node, b: Node): boolean => a.f !== b.f ? a.f < b.f : a.tick !== b.tick ? a.tick > b.tick : a.key < b.key;

/** Bounded pose-aware A* over a (gridM, yawSteps) lattice using drive-feasible
 * motion primitives with full swept-volume clearance. Costs are integer arrival
 * ticks derived from cumulative seconds at maximum speed (acceleration ignored).
 * Never throws for search outcomes: exhaustion is infeasible, the expansion
 * limit and unmet sweep bounds are unresolved. Typed errors only for invalid
 * inputs (unsupported drive, off-lattice poses, unsupported yawSteps). */
export function findRoute(profile: RobotProfile, start: RobotState, goal: RouteGoal, obstacles: readonly StaticObstacle[], options: RouteOptions): RouteResult {
  assertDrive(profile);
  const { tolerances: tol, bounds } = options;
  const limit = options.expansionLimit ?? DEFAULT_EXPANSION_LIMIT;
  const dirs = headings(tol.yawSteps);
  const yawUnit = (2 * Math.PI) / tol.yawSteps;
  const wrap = (i: number): number => ((i % tol.yawSteps) + tol.yawSteps) % tol.yawSteps;
  const keyOf = (ix: number, iy: number, iyaw: number): string => `${ix},${iy},${wrap(iyaw)}`;
  const poseOf = (ix: number, iy: number, iyaw: number): Pose => ({ xM: ix * tol.gridM, yM: iy * tol.gridM, zM: start.pose.zM, yawRad: iyaw * yawUnit });
  const s = { ix: index(start.pose.xM, tol.gridM, 'start x'), iy: index(start.pose.yM, tol.gridM, 'start y'), iyaw: index(start.pose.yawRad, yawUnit, 'start yaw') };
  const g = { ix: index(goal.pose.xM, tol.gridM, 'goal x'), iy: index(goal.pose.yM, tol.gridM, 'goal y'), iyaw: index(goal.pose.yawRad, yawUnit, 'goal yaw') };
  const goalKey = keyOf(g.ix, g.iy, g.iyaw);
  const inBounds = (ix: number, iy: number): boolean =>
    ix * tol.gridM >= bounds.minXM - LATTICE_EPS && ix * tol.gridM <= bounds.maxXM + LATTICE_EPS && iy * tol.gridM >= bounds.minYM - LATTICE_EPS && iy * tol.gridM <= bounds.maxYM + LATTICE_EPS;

  const blocked = (check: ReturnType<typeof standingClear>, reason: InfeasibleReason): RouteResult | null =>
    check.kind === 'blocked' ? { kind: 'infeasible', reason, obstacleId: check.obstacleId, expansions: 0 } : null;
  const startBlocked = blocked(standingClear(profile, start.pose, start.loaded, obstacles, tol), 'START_BLOCKED');
  if (startBlocked) return startBlocked;
  if (goal.transition !== 'none') {
    // A load/unload transition must fit the station in both load states.
    for (const loaded of [false, true]) {
      const station = blocked(standingClear(profile, goal.pose, loaded, obstacles, tol), 'STATION_CLEARANCE');
      if (station) return station;
    }
  } else {
    const goalBlocked = blocked(standingClear(profile, goal.pose, start.loaded, obstacles, tol), 'GOAL_BLOCKED');
    if (goalBlocked) return goalBlocked;
  }

  const heuristic = (ix: number, iy: number): number => secondsFor(Math.hypot((g.ix - ix) * tol.gridM, (g.iy - iy) * tol.gridM), profile.maxSpeedMps);
  const open = new Heap(before);
  const best = new Map<string, number>();
  const root: Node = { key: keyOf(s.ix, s.iy, s.iyaw), ix: s.ix, iy: s.iy, iyaw: s.iyaw, seconds: 0, tick: 0, f: ticksForSeconds(heuristic(s.ix, s.iy)), parent: null, primitive: null };
  open.push(root);
  best.set(root.key, 0);
  let expansions = 0;

  const successors = (node: Node): [number, number, number, MotionPrimitive][] => {
    const out: [number, number, number, MotionPrimitive][] = [
      [node.ix, node.iy, node.iyaw + 1, { kind: 'rotate', dYawRad: yawUnit }],
      [node.ix, node.iy, node.iyaw - 1, { kind: 'rotate', dYawRad: -yawUnit }],
    ];
    const moves = profile.drive === 'omnidirectional' ? dirs : [dirs[wrap(node.iyaw)]!, ...(profile.reverse ? [dirs[wrap(node.iyaw)]!.map((v) => -v) as [number, number]] : [])];
    for (const [dx, dy] of moves) out.push([node.ix + dx, node.iy + dy, node.iyaw, { kind: 'translate', dxM: dx * tol.gridM, dyM: dy * tol.gridM }]);
    return out;
  };

  while (open.size > 0) {
    const node = open.pop();
    if ((best.get(node.key) ?? Infinity) < node.seconds - SECONDS_EPS) continue; // stale entry
    if (node.key === goalKey) return { kind: 'path', start: start.pose, steps: reconstruct(node, poseOf, goal.pose), ticks: node.tick, expansions };
    if (expansions >= limit) return { kind: 'unresolved', reason: 'EXPANSION_LIMIT', expansions };
    expansions++;
    const pose = poseOf(node.ix, node.iy, node.iyaw);
    for (const [ix, iy, iyaw, primitive] of successors(node)) {
      if (!inBounds(ix, iy)) continue;
      const key = keyOf(ix, iy, iyaw);
      const seconds = node.seconds + primitiveSeconds(profile, primitive);
      if ((best.get(key) ?? Infinity) <= seconds + SECONDS_EPS) continue;
      const check = checkMove(profile, { ...start, pose }, primitive, obstacles, tol);
      if (check.kind === 'unresolved') return { kind: 'unresolved', reason: 'SWEEP_BOUND', expansions };
      if (check.kind !== 'clear') continue;
      best.set(key, seconds);
      open.push({ key, ix, iy, iyaw, seconds, tick: ticksForSeconds(seconds), f: ticksForSeconds(seconds + heuristic(ix, iy)), parent: node, primitive });
    }
  }
  return { kind: 'infeasible', reason: 'EXHAUSTED', obstacleId: null, expansions };
}

/** Walks parent pointers. The final pose is the requested goal pose itself so the
 * yaw is not reported modulo a full turn. */
function reconstruct(node: Node, poseOf: (ix: number, iy: number, iyaw: number) => Pose, goalPose: Pose): PathStep[] {
  const steps: PathStep[] = [];
  for (let n: Node | null = node; n && n.primitive; n = n.parent) steps.push({ pose: poseOf(n.ix, n.iy, n.iyaw), tick: n.tick, primitive: n.primitive });
  steps.reverse();
  const last = steps.at(-1);
  if (last) last.pose = goalPose;
  return steps;
}
