import type { Pose, RobotProfile, Scene, Station } from '@robopomelo/spec';
import type { FleetStation } from './fleet-types.js';
import { activeFootprint, standingClear } from './motion.js';
import type { Bounds } from './route.js';
import { circumradius } from './sweep.js';
import { SimulationError, obstacleFromInstance, type StaticObstacle, type Tolerances } from './types.js';

/** Static obstacles from every scene instance except the listed robot instances.
 * Instances with unknown dimensions are skipped (their state stays explicit upstream). */
export function sceneObstacles(scene: Scene, robotInstanceIds: ReadonlySet<string>): StaticObstacle[] {
  const out: StaticObstacle[] = [];
  for (const instance of scene.instances) {
    if (robotInstanceIds.has(instance.id)) continue;
    const obstacle = obstacleFromInstance(instance);
    if (obstacle) out.push(obstacle);
  }
  return out;
}

export function floorBounds(scene: Scene): Bounds {
  if (scene.floor.state !== 'known' && scene.floor.state !== 'unverified') throw new SimulationError('UNKNOWN_FLOOR', `scene ${scene.id} has no floor dimensions`);
  return { minXM: 0, maxXM: scene.floor.value.lengthM, minYM: 0, maxYM: scene.floor.value.widthM };
}

/** Nearest lattice pose (positions to gridM, yaw to the yaw step). Quantization is a
 * stated input; callers snap explicitly rather than the engine doing it silently. */
export function snapPose(pose: Pose, tol: Tolerances): Pose {
  const yawUnit = (2 * Math.PI) / tol.yawSteps;
  return { xM: Math.round(pose.xM / tol.gridM) * tol.gridM, yM: Math.round(pose.yM / tol.gridM) * tol.gridM, zM: pose.zM, yawRad: Math.round(pose.yawRad / yawUnit) * yawUnit };
}

/** Derives one lattice service pose per station: the robot stands beside the station
 * instance, facing it, offset by the half extent plus the largest loaded footprint
 * circumradius across profiles (rounded up to the lattice). Candidate sides are
 * ordered by distance to the floor centre so approaches face the open floor; the
 * first side that is standing-clear for every profile in both load states wins. */
export function servicePoses(scene: Scene, stations: readonly Station[], profiles: readonly RobotProfile[], obstacles: readonly StaticObstacle[], bounds: Bounds, tol: Tolerances): FleetStation[] {
  const reach = Math.max(...profiles.map((p) => Math.max(circumradius(activeFootprint(p, false)), circumradius(activeFootprint(p, true))))) + tol.sweepBoundM;
  const cx = (bounds.minXM + bounds.maxXM) / 2, cy = (bounds.minYM + bounds.maxYM) / 2;
  return stations.map((station) => {
    const instance = scene.instances.find((i) => i.id === station.instanceId);
    if (!instance) throw new SimulationError('UNKNOWN_INSTANCE', `station ${station.id} references missing instance ${station.instanceId}`);
    const d = instance.dimensions;
    if (d.state !== 'known' && d.state !== 'unverified') throw new SimulationError('UNKNOWN_DIMENSIONS', `station ${station.id} instance has no dimensions`);
    const { xM, yM, zM } = instance.pose;
    const up = (v: number): number => Math.ceil(v / tol.gridM - 1e-9) * tol.gridM;
    const ox = up(d.value.lengthM / 2 + reach), oy = up(d.value.widthM / 2 + reach);
    const snapped = snapPose({ xM, yM, zM, yawRad: 0 }, tol);
    const candidates: Pose[] = [
      { xM: snapped.xM + ox, yM: snapped.yM, zM, yawRad: Math.PI },
      { xM: snapped.xM - ox, yM: snapped.yM, zM, yawRad: 0 },
      { xM: snapped.xM, yM: snapped.yM + oy, zM, yawRad: -Math.PI / 2 },
      { xM: snapped.xM, yM: snapped.yM - oy, zM, yawRad: Math.PI / 2 },
    ].sort((a, b) => Math.hypot(a.xM - cx, a.yM - cy) - Math.hypot(b.xM - cx, b.yM - cy));
    const inBounds = (p: Pose): boolean => p.xM >= bounds.minXM && p.xM <= bounds.maxXM && p.yM >= bounds.minYM && p.yM <= bounds.maxYM;
    const clear = (p: Pose): boolean => profiles.every((profile) => [false, true].every((loaded) => standingClear(profile, p, loaded, obstacles, tol).kind === 'clear'));
    const pose = candidates.find((p) => inBounds(p) && clear(p));
    if (!pose) throw new SimulationError('STATION_UNREACHABLE', `station ${station.id} has no clear lattice service pose`);
    return { ...station, pose };
  });
}
