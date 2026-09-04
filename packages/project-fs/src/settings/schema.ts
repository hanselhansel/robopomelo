import { isAbsolute } from 'node:path';
import type { Scope } from '@robopomelo/spec';
import { ProjectFsError } from '../errors.js';
import type { RootIdentity } from '../fs/safe-fs.js';
import type { Authorization } from '../contracts.js';

export type TrustMode = 'autonomous' | 'review-each-change';
export interface ProjectBinding extends RootIdentity {
  projectId: string;
}
export interface TrustGrant extends Authorization {
  binding: ProjectBinding;
  mode: TrustMode;
  grantedAt: string;
  revokedAt: string | null;
}
export interface UpdatePolicy {
  mode: 'auto' | 'notify' | 'off';
  offline: boolean;
  pinnedVersion: string | null;
  skippedVersions: string[];
}
export interface RollbackHold {
  version: string;
  previousVersion: string | null;
  priorPolicy: UpdatePolicy;
  policyGeneration: number;
}
export interface UpdateSettings extends UpdatePolicy {
  generation: number;
  rollbackHold: RollbackHold | null;
}
export interface MachineSettings {
  version: 1;
  generation: number;
  grants: TrustGrant[];
  updates: UpdateSettings;
}
export interface SettingsAuthority {
  readonly scopes: readonly Scope[];
}
const scopes = new Set<Scope>([
  'inspect',
  'author',
  'evidence',
  'export',
  'record-decisions',
  'manage-settings',
]);
function invalid(): never {
  throw new ProjectFsError(
    'SETTINGS_INVALID',
    'Machine settings are invalid. Preserve the file and inspect its backup before changing authority.',
  );
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).sort().join(',') === expected.sort().join(',');
const date = (value: unknown) =>
  typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const generation = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const version = (value: unknown) =>
  typeof value === 'string' &&
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(value) &&
  value.length <= 40;

export function validateScopes(value: unknown): asserts value is Scope[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > scopes.size ||
    new Set(value).size !== value.length ||
    value.some((scope) => !scopes.has(scope))
  )
    invalid();
}
export function validateBinding(value: unknown): asserts value is ProjectBinding {
  if (
    !object(value) ||
    !keys(value, ['canonicalPath', 'device', 'fileId', 'projectId']) ||
    typeof value.canonicalPath !== 'string' ||
    value.canonicalPath.length > 4096 ||
    !isAbsolute(value.canonicalPath) ||
    typeof value.device !== 'string' ||
    !/^\d+$/.test(value.device) ||
    typeof value.fileId !== 'string' ||
    !/^\d+$/.test(value.fileId) ||
    typeof value.projectId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9.:_-]{0,127}$/.test(value.projectId)
  )
    invalid();
}
export function validateMode(value: unknown): asserts value is TrustMode {
  if (value !== 'autonomous' && value !== 'review-each-change') invalid();
}
export function validateSettings(value: unknown): asserts value is MachineSettings {
  if (
    !object(value) ||
    !keys(value, ['version', 'generation', 'grants', 'updates']) ||
    value.version !== 1 ||
    !generation(value.generation) ||
    !Array.isArray(value.grants) ||
    value.grants.length > 1000
  )
    invalid();
  const ids = new Set<string>();
  for (const grant of value.grants) {
    if (
      !object(grant) ||
      !keys(grant, ['grantId', 'generation', 'scopes', 'binding', 'mode', 'grantedAt', 'revokedAt']) ||
      typeof grant.grantId !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(grant.grantId) ||
      ids.has(grant.grantId) ||
      !generation(grant.generation) ||
      Number(grant.generation) > Number(value.generation) ||
      !date(grant.grantedAt) ||
      (grant.revokedAt !== null && !date(grant.revokedAt))
    )
      invalid();
    ids.add(grant.grantId);
    validateBinding(grant.binding);
    validateScopes(grant.scopes);
    validateMode(grant.mode);
  }
  validateUpdates(value.updates);
}
function validatePolicy(value: unknown): asserts value is UpdatePolicy {
  if (
    !object(value) ||
    !keys(value, ['mode', 'offline', 'pinnedVersion', 'skippedVersions']) ||
    !['auto', 'notify', 'off'].includes(String(value.mode)) ||
    typeof value.offline !== 'boolean' ||
    (value.pinnedVersion !== null && !version(value.pinnedVersion)) ||
    !Array.isArray(value.skippedVersions) ||
    value.skippedVersions.length > 1000 ||
    new Set(value.skippedVersions).size !== value.skippedVersions.length ||
    value.skippedVersions.some((item) => !version(item))
  )
    invalid();
}
export function validateUpdates(value: unknown): asserts value is UpdateSettings {
  if (
    !object(value) ||
    !keys(value, ['mode', 'offline', 'pinnedVersion', 'skippedVersions', 'generation', 'rollbackHold']) ||
    !generation(value.generation)
  )
    invalid();
  const { generation: _, rollbackHold: hold, ...policy } = value;
  validatePolicy(policy);
  if (hold !== null) {
    if (
      !object(hold) ||
      !keys(hold, ['version', 'previousVersion', 'priorPolicy', 'policyGeneration']) ||
      !version(hold.version) ||
      (hold.previousVersion !== null && !version(hold.previousVersion)) ||
      !generation(hold.policyGeneration) ||
      Number(hold.policyGeneration) > Number(value.generation)
    )
      invalid();
    validatePolicy(hold.priorPolicy);
  }
}
export function defaultSettings(): MachineSettings {
  return {
    version: 1,
    generation: 0,
    grants: [],
    updates: {
      mode: 'auto',
      offline: false,
      pinnedVersion: null,
      skippedVersions: [],
      generation: 0,
      rollbackHold: null,
    },
  };
}
export function parseSettings(bytes: Uint8Array): MachineSettings {
  if (bytes.byteLength > 1024 * 1024) invalid();
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return invalid();
  }
  validateSettings(value);
  return value;
}
export function requireSettingsAuthority(authority: SettingsAuthority): void {
  if (!authority?.scopes?.includes('manage-settings'))
    throw new ProjectFsError(
      'SCOPE_DENIED',
      'Managing local settings requires explicit manage-settings authority.',
    );
}
