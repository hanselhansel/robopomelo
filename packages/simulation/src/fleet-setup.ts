import type { RobotProfile } from '@robopomelo/spec';
import type { RobotRun } from './fleet-robot.js';
import type { FleetInput, FleetLimits, FleetStation, FleetTuning } from './fleet-types.js';
import { generateJobs, type JobSpec } from './jobs.js';
import { assertDrive, standingClear } from './motion.js';
import { standingCells } from './reservations.js';
import type { Bounds } from './route.js';
import { DEFAULT_TOLERANCES, SimulationError, type StaticObstacle, type Tolerances } from './types.js';

export type Prepared = {
  jobs: JobSpec[]; stations: Map<string, FleetStation>; profiles: Map<string, RobotProfile>;
  robots: Map<string, RobotRun>; tol: Tolerances; obstacles: readonly StaticObstacle[]; bounds: Bounds;
};

const LATTICE_EPS = 1e-6;
const onLattice = (value: number, unit: number): boolean => Math.abs(value / unit - Math.round(value / unit)) <= LATTICE_EPS;
const positiveInt = (v: number, what: string): void => {
  if (!Number.isSafeInteger(v) || v <= 0) throw new SimulationError('INVALID_LIMIT', `${what} ${v} must be a positive integer`);
};

/** Validates every input and builds the immutable run state. Throws SimulationError
 * so runFleet can report termination 'invalid' with the code and message. */
export function prepare(input: FleetInput, limits: FleetLimits, tuning: FleetTuning): Prepared {
  const tol = input.tolerances ?? DEFAULT_TOLERANCES;
  if (tol.yawSteps !== 4 && tol.yawSteps !== 8) throw new SimulationError('UNSUPPORTED_YAW_STEPS', `yawSteps ${tol.yawSteps} is not 4 or 8`);
  if (!(tol.gridM > 0) || !(tol.sweepBoundM > 0)) throw new SimulationError('INVALID_TOLERANCES', 'gridM and sweepBoundM must be positive');
  positiveInt(limits.maxTicks, 'maxTicks'); positiveInt(limits.maxExpansionsPerRoute, 'maxExpansionsPerRoute');
  if (!Number.isSafeInteger(limits.replanBudgetPerRobot) || limits.replanBudgetPerRobot < 0) throw new SimulationError('INVALID_LIMIT', `replanBudgetPerRobot ${limits.replanBudgetPerRobot} must be a non-negative integer`);
  for (const [k, v] of Object.entries(tuning)) if (!(v > 0) || !Number.isFinite(v)) throw new SimulationError('INVALID_TUNING', `tuning ${k} ${v} must be positive and finite`);
  positiveInt(tuning.serviceTicks, 'serviceTicks'); positiveInt(tuning.retryTicks, 'retryTicks'); positiveInt(tuning.maxShifts, 'maxShifts'); positiveInt(tuning.escapeExpansions, 'escapeExpansions'); positiveInt(tuning.patienceTicks, 'patienceTicks');
  if (!Number.isInteger(input.seed) || input.seed < 1 || input.seed > 0xffffffff) throw new SimulationError('INVALID_SEED', `seed ${input.seed} must be a 32-bit positive integer`);
  if (input.policy.name !== 'fifo-nearest' && input.policy.name !== 'cost-estimate') throw new SimulationError('UNKNOWN_POLICY', `policy ${String(input.policy.name)} is not supported`);
  const b = input.bounds;
  if (!(b.minXM < b.maxXM) || !(b.minYM < b.maxYM)) throw new SimulationError('INVALID_BOUNDS', 'bounds must have positive extent');

  const profiles = new Map<string, RobotProfile>();
  for (const p of input.profiles) {
    if (profiles.has(p.id)) throw new SimulationError('DUPLICATE_PROFILE', `profile ${p.id} is defined twice`);
    assertDrive(p);
    profiles.set(p.id, p);
  }
  const yawUnit = (2 * Math.PI) / tol.yawSteps;
  const checkPose = (pose: { xM: number; yM: number; yawRad: number }, what: string): void => {
    if (!onLattice(pose.xM, tol.gridM) || !onLattice(pose.yM, tol.gridM) || !onLattice(pose.yawRad, yawUnit)) throw new SimulationError('OFF_LATTICE', `${what} pose is not on the ${tol.gridM} m / ${tol.yawSteps}-heading lattice`);
    if (pose.xM < b.minXM || pose.xM > b.maxXM || pose.yM < b.minYM || pose.yM > b.maxYM) throw new SimulationError('OUT_OF_BOUNDS', `${what} pose is outside the floor bounds`);
  };
  const stations = new Map<string, FleetStation>();
  for (const s of input.stations) {
    if (stations.has(s.id)) throw new SimulationError('DUPLICATE_STATION', `station ${s.id} is defined twice`);
    positiveInt(s.capacity, `station ${s.id} capacity`);
    checkPose(s.pose, `station ${s.id}`);
    stations.set(s.id, s);
  }
  const robots = new Map<string, RobotRun>();
  const occupied = new Map<string, string>();
  for (const r of input.robots) {
    if (robots.has(r.id)) throw new SimulationError('DUPLICATE_ROBOT', `robot ${r.id} is defined twice`);
    const profile = profiles.get(r.profileId);
    if (!profile) throw new SimulationError('UNKNOWN_PROFILE', `robot ${r.id} references unknown profile ${r.profileId}`);
    checkPose(r.pose, `robot ${r.id}`);
    const state = { profileId: profile.id, pose: { ...r.pose }, loaded: false };
    const clear = standingClear(profile, r.pose, false, input.obstacles, tol);
    if (clear.kind !== 'clear') throw new SimulationError('START_BLOCKED', `robot ${r.id} starts inside obstacle ${clear.kind === 'blocked' ? clear.obstacleId : 'unresolved'}`);
    for (const cell of standingCells(profile, state, tol)) {
      const other = occupied.get(cell);
      if (other) throw new SimulationError('ROBOTS_OVERLAP', `robots ${other} and ${r.id} share start cell ${cell}`);
      occupied.set(cell, r.id);
    }
    robots.set(r.id, { id: r.id, profile, state, home: { ...r.pose }, lowBattery: r.lowBattery ?? false, job: null, legIndex: 0, pending: null, plan: null, service: null, hold: null, yieldRequested: false, parkRetryAt: 0, parkFailures: 0, legs: [] });
  }
  let jobs: JobSpec[];
  if (input.jobs) {
    jobs = [...input.jobs].sort((a, c) => a.releaseTick - c.releaseTick || (a.id < c.id ? -1 : a.id > c.id ? 1 : 0));
    const ids = new Set<string>();
    for (const j of jobs) {
      if (ids.has(j.id)) throw new SimulationError('DUPLICATE_JOB', `job ${j.id} is defined twice`);
      ids.add(j.id);
      if (!Number.isSafeInteger(j.releaseTick) || j.releaseTick < 0 || !Number.isSafeInteger(j.priority)) throw new SimulationError('INVALID_JOB', `job ${j.id} needs integer releaseTick >= 0 and integer priority`);
      for (const id of [j.fromStationId, j.toStationId]) if (!stations.has(id)) throw new SimulationError('UNKNOWN_STATION', `job ${j.id} references unknown station ${id}`);
    }
  } else if (input.workload) jobs = generateJobs(input.workload, [...stations.values()]);
  else throw new SimulationError('NO_JOBS', 'either workload or jobs must be provided');
  return { jobs, stations, profiles, robots, tol, obstacles: input.obstacles, bounds: b };
}
