import { ProjectFsError } from '../errors.js';
import { byteHash } from '../transactions/digest.js';
import { closed, isHash } from '../transactions/metadata.js';

export const RUN_TERMINATIONS = ['completed', 'cancelled', 'budget', 'deadlock', 'invalid'] as const;
export type RunTermination = (typeof RUN_TERMINATIONS)[number];
/** Simulation contract manifest. Source identity names the exact revision the
 * run was computed from; the store checksums the whole record so a manifest
 * cannot later be edited to claim another revision. */
export type RunManifest = {
  formatVersion: '1.0.0'; runId: string; sourceRevision: string; sourceHash: string;
  inputHash: string; workloadHash: string; assetHashes: string[]; engineVersion: string; policyVersion: string;
  seed: number; durationTicks: number; termination: RunTermination; eventCount: number; eventSha256: string;
};
export const RUN_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const KEYS = ['formatVersion', 'runId', 'sourceRevision', 'sourceHash', 'inputHash', 'workloadHash', 'assetHashes', 'engineVersion', 'policyVersion', 'seed', 'durationTicks', 'termination', 'eventCount', 'eventSha256'];
const VERSION = /^[0-9A-Za-z][0-9A-Za-z./_-]{0,63}$/;
const fail = (message: string): never => { throw new ProjectFsError('RUN_MANIFEST_INVALID', message); };
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function validateRunManifest(value: unknown): RunManifest {
  if (!closed(value, KEYS)) return fail('Run manifest must contain exactly the contract fields.');
  const m = value;
  if (m.formatVersion !== '1.0.0') fail('Run manifest format version is not supported.');
  if (typeof m.runId !== 'string' || !RUN_ID.test(m.runId)) fail('Run id must be a lowercase slug.');
  if (typeof m.sourceRevision !== 'string' || !m.sourceRevision.trim() || m.sourceRevision.length > 128) fail('Run manifest needs its source revision.');
  for (const key of ['sourceHash', 'inputHash', 'workloadHash', 'eventSha256'] as const) if (!isHash(m[key])) fail(`Run manifest ${key} must be a sha256 hex digest.`);
  if (!Array.isArray(m.assetHashes) || m.assetHashes.length > 10_000 || !m.assetHashes.every(isHash)) fail('Run manifest asset hashes must be sha256 hex digests.');
  for (const key of ['engineVersion', 'policyVersion'] as const) if (typeof m[key] !== 'string' || !VERSION.test(m[key])) fail(`Run manifest ${key} is invalid.`);
  if (!Number.isSafeInteger(m.seed) || (m.seed as number) < 1 || (m.seed as number) > 0xffffffff) fail('Run seed must be a 32-bit positive integer.');
  if (!count(m.durationTicks) || !count(m.eventCount)) fail('Run duration and event count must be non-negative integers.');
  if (!RUN_TERMINATIONS.includes(m.termination as RunTermination)) fail('Run termination is not a known outcome.');
  return m as RunManifest;
}

/** Same digest the engine records: sha256 of the events array serialized once. */
export const eventSha256 = (events: readonly unknown[]): string => byteHash(JSON.stringify(events));
