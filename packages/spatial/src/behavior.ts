import type { StationKind } from '@robopomelo/spec';
import { assertSafeData } from './catalog.js';
import { SpatialError } from './hash.js';
/** Station behavior profiles: closed, bounded data interpreted by the
 * simulator. Only the station queue/dwell kind exists; anything else is an
 * explicit unsupported error rather than a silently ignored script. */
export type BehaviorProfile = {
  id: string; version: string; kind: 'station-queue';
  queueCapacity: number; dwellSeconds: { load: number; unload: number }; approach: 'front' | 'side';
};
export const BEHAVIOR_BOUNDS = Object.freeze({ queueCapacity: { minimum: 1, maximum: 64 }, dwellSeconds: { minimum: 0, maximum: 3600 } });
const COMPATIBLE: Record<BehaviorProfile['kind'], readonly StationKind[]> = { 'station-queue': ['pickup', 'dropoff', 'holding'] };
const ID = /^[a-z][a-z0-9-]{0,63}$/, VERSION = /^\d+\.\d+\.\d+$/;
const fail = (code: string, message: string): never => { throw new SpatialError(code, message); };
const bounded = (value: unknown, min: number, max: number, integer: boolean, what: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max)
    return fail('PARAMETER_OUT_OF_RANGE', `${what} must be ${integer ? 'an integer' : 'a number'} in [${min}, ${max}].`);
  return value;
};
export function validateBehavior(value: unknown): BehaviorProfile {
  assertSafeData(value, 'behavior');
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('BEHAVIOR_INVALID', 'A behavior profile must be an object.');
  const r = value as Record<string, unknown>;
  const allowed = ['id', 'version', 'kind', 'queueCapacity', 'dwellSeconds', 'approach'];
  for (const key of allowed) if (!Object.hasOwn(r, key)) fail('BEHAVIOR_INVALID', `Behavior is missing ${key}.`);
  for (const key of Object.keys(r)) if (!allowed.includes(key)) fail('BEHAVIOR_INVALID', `Behavior has unknown field ${key}.`);
  if (r.kind !== 'station-queue') fail('BEHAVIOR_UNSUPPORTED', `Behavior kind ${String(r.kind)} is not supported; only station-queue exists.`);
  if (typeof r.id !== 'string' || !ID.test(r.id)) fail('BEHAVIOR_INVALID', 'Behavior id must be a lowercase slug.');
  if (typeof r.version !== 'string' || !VERSION.test(r.version)) fail('BEHAVIOR_INVALID', 'Behavior version must be semantic.');
  if (r.approach !== 'front' && r.approach !== 'side') fail('BEHAVIOR_INVALID', 'Behavior approach must be front or side.');
  const dwell = r.dwellSeconds;
  if (!dwell || typeof dwell !== 'object' || Array.isArray(dwell) || Object.keys(dwell).some((k) => k !== 'load' && k !== 'unload')) fail('BEHAVIOR_INVALID', 'dwellSeconds needs load and unload only.');
  const d = dwell as Record<string, unknown>, b = BEHAVIOR_BOUNDS;
  return {
    id: r.id as string, version: r.version as string, kind: 'station-queue',
    queueCapacity: bounded(r.queueCapacity, b.queueCapacity.minimum, b.queueCapacity.maximum, true, 'queueCapacity'),
    dwellSeconds: { load: bounded(d.load, b.dwellSeconds.minimum, b.dwellSeconds.maximum, false, 'dwellSeconds.load'), unload: bounded(d.unload, b.dwellSeconds.minimum, b.dwellSeconds.maximum, false, 'dwellSeconds.unload') },
    approach: r.approach as 'front' | 'side',
  };
}
export const compatibleWith = (profile: BehaviorProfile, stationKind: StationKind): boolean => COMPATIBLE[profile.kind].includes(stationKind);
export function behaviorFor(behaviors: readonly BehaviorProfile[], id: string, version: string): BehaviorProfile {
  return behaviors.find((b) => b.id === id && b.version === version) ?? fail('ASSET_UNKNOWN', `No behavior ${id}@${version} is available.`);
}
/** Fixture: a three-deep queue with 20 s load and 15 s unload dwell, approached from the front. */
export const STATION_QUEUE_BEHAVIOR: BehaviorProfile = Object.freeze({
  id: 'station-queue-standard', version: '1.0.0', kind: 'station-queue', queueCapacity: 3, dwellSeconds: Object.freeze({ load: 20, unload: 15 }), approach: 'front',
}) as BehaviorProfile;
