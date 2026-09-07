import type { Instance, Pose, RobotProfile } from '@robopomelo/spec';

/** Version of the quantization and tolerance policy. Tolerances are versioned
 * inputs to every run, never hidden tuning. Bump when defaults or semantics change. */
export const POLICY_VERSION = '1.0.0';
/** Simulation ticks are integers. One tick is TICK_MS milliseconds of simulated time. */
export type Tick = number;
export const TICK_MS = 100;

export class SimulationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SimulationError';
  }
}

export type Vec2 = [number, number];
/** Vertex list in meters. Collision math treats polygons as convex; callers hull
 * non-convex footprints, which is a conservative superset. */
export type Polygon = Vec2[];
export type OrientedBox = { center: Vec2; lengthM: number; widthM: number; yawRad: number };
/** Vertical interval [zMinM, zMaxM] lets overhead obstacles clear short robots. */
export type ZInterval = { zMinM: number; zMaxM: number };
export type StaticObstacle = { id: string; polygon: Polygon } & ZInterval;
export type RobotState = { profileId: string; pose: Pose; loaded: boolean };

/** Bounded motion primitives. A translate with both components non-zero is a
 * diagonal move. Acceleration is ignored at this layer: every primitive runs
 * at the profile's maximum linear or angular speed. */
export type MotionPrimitive =
  | { kind: 'translate'; dxM: number; dyM: number }
  | { kind: 'rotate'; dYawRad: number };
/** Pose reached after applying `primitive`, arriving at integer `tick`. */
export type PathStep = { pose: Pose; tick: Tick; primitive: MotionPrimitive };

export type Tolerances = {
  /** Maximum distance the true swept area may extend beyond a sampled footprint
   * before subdivision; conservative bounds inflate by this amount. */
  sweepBoundM: number;
  /** Maximum angular subdivisions for one rotation before it is unresolved. */
  maxSubdivisions: number;
  /** Lattice spacing for route search. */
  gridM: number;
  /** Discrete headings per full turn (4 or 8 supported). */
  yawSteps: number;
};
export const DEFAULT_TOLERANCES: Tolerances = { sweepBoundM: 0.01, maxSubdivisions: 64, gridM: 0.25, yawSteps: 8 };

export type SweepResult = { resolved: true; polygons: Polygon[] } | { resolved: false; reason: 'SUBDIVISION_LIMIT' };

export type RobotZInterval = ZInterval;
export const robotZInterval = (profile: RobotProfile, pose: Pose): ZInterval => ({ zMinM: pose.zM, zMaxM: pose.zM + profile.heightM });

/** Builds a rectangular static obstacle from an instance whose dimensions carry a
 * value (known or unverified). The instance pose is the footprint center;
 * lengthM runs along local x and widthM along local y. Returns null when the
 * dimensions are unknown or not applicable so callers keep that state explicit. */
export function obstacleFromInstance(instance: Instance): StaticObstacle | null {
  const d = instance.dimensions;
  if (d.state !== 'known' && d.state !== 'unverified') return null;
  const { lengthM, widthM, heightM } = d.value;
  const { xM, yM, zM, yawRad } = instance.pose;
  const c = Math.cos(yawRad), s = Math.sin(yawRad), hl = lengthM / 2, hw = widthM / 2;
  const corners: Vec2[] = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]];
  return {
    id: instance.id,
    polygon: corners.map(([x, y]) => [xM + x * c - y * s, yM + x * s + y * c]),
    zMinM: zM,
    zMaxM: zM + heightM,
  };
}
