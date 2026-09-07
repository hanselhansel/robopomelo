import type { RobotProfile } from '@robopomelo/spec';
import { checkMove, standingClear, type MoveCheck } from './motion.js';
import type { MotionPrimitive, RobotState, StaticObstacle, Tolerances } from './types.js';
export interface StaticOracle {
  check(state: RobotState, primitive: MotionPrimitive): MoveCheck;
  standing(state: RobotState): ReturnType<typeof standingClear>;
  /** Optional: a checker for a small dynamic obstacle set sharing this oracle's templates. */
  forExtras?(obstacles: readonly StaticObstacle[]): StaticOracle;
}
const quantize = (value: number, unit: number): number => Math.round(value / unit);
/** Memoized swept-volume checks against the static scene for one robot profile.
 * Results depend only on the lattice pose, load state and primitive because the
 * obstacles never change within a run, so caching is exact: the same polygon
 * computation runs once per key. The independent trace checker never uses it. */
export class StaticMoveCache implements StaticOracle {
  #moves = new Map<string, MoveCheck>();
  #standing = new Map<string, ReturnType<typeof standingClear>>();
  readonly #yawUnit: number;
  constructor(private readonly profile: RobotProfile, private readonly obstacles: readonly StaticObstacle[], private readonly tol: Tolerances) {
    this.#yawUnit = (2 * Math.PI) / tol.yawSteps;
  }
  get size(): number { return this.#moves.size + this.#standing.size; }
  #poseKey(state: RobotState): string {
    const yaw = ((quantize(state.pose.yawRad, this.#yawUnit) % this.tol.yawSteps) + this.tol.yawSteps) % this.tol.yawSteps;
    return `${state.loaded ? 'L' : 'E'}|${quantize(state.pose.xM, this.tol.gridM)},${quantize(state.pose.yM, this.tol.gridM)},${yaw}`;
  }
  check(state: RobotState, primitive: MotionPrimitive): MoveCheck {
    const key = this.#poseKey(state) + '|' + (primitive.kind === 'translate' ? `t${quantize(primitive.dxM, this.tol.gridM / 4)},${quantize(primitive.dyM, this.tol.gridM / 4)}` : `r${quantize(primitive.dYawRad, this.#yawUnit / 4)}`);
    let result = this.#moves.get(key);
    if (!result) { result = checkMove(this.profile, state, primitive, this.obstacles, this.tol); this.#moves.set(key, result); }
    return result;
  }
  standing(state: RobotState): ReturnType<typeof standingClear> {
    const key = this.#poseKey(state);
    let result = this.#standing.get(key);
    if (!result) { result = standingClear(this.profile, state.pose, state.loaded, this.obstacles, this.tol); this.#standing.set(key, result); }
    return result;
  }
}
