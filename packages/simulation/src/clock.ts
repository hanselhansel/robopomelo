import { SimulationError, TICK_MS, type Tick } from './types.js';

const TICK_S = TICK_MS / 1000;
/** Absorbs floating-point noise from summing step durations (e.g. 40 × 0.25 s)
 * so that an exact multiple of a tick never rounds up to the next tick. */
const ROUNDING_EPS = 1e-9;

/** Integer ticks needed to elapse `seconds`, rounding up. Never fractional. */
export function ticksForSeconds(seconds: number): Tick {
  if (!Number.isFinite(seconds) || seconds < 0) throw new SimulationError('INVALID_DURATION', `duration ${seconds} s is not a finite non-negative number`);
  return Math.max(0, Math.ceil(seconds / TICK_S - ROUNDING_EPS));
}

/** Integer ticks to cover `distanceM` at constant `speedMps` (acceleration ignored
 * at this layer), rounding up. */
export function ticksFor(distanceM: number, speedMps: number): Tick {
  if (!(speedMps > 0) || !Number.isFinite(speedMps)) throw new SimulationError('INVALID_SPEED', `speed ${speedMps} m/s must be positive and finite`);
  return ticksForSeconds(Math.abs(distanceM) / speedMps);
}

export const secondsFor = (distance: number, speed: number): number => Math.abs(distance) / speed;

/** Stable total order over robot IDs for deterministic tie-breaking. Code-point
 * comparison, never locale dependent. */
export function compareRobotIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sorts robot IDs into the canonical deterministic order. */
export const orderRobotIds = (ids: readonly string[]): string[] => [...ids].sort(compareRobotIds);
