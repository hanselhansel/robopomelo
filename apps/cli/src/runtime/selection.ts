import type { UpdateSettings } from '../../../../packages/project-fs/src/settings/schema.js';
import { RuntimeError } from './errors.js';
export interface RunPolicy {
  offline?: boolean;
  mode?: 'auto' | 'notify' | 'off';
  explicitVersion?: string;
  sourceCheckout?: boolean;
}
export type SelectionReason = 'explicit' | 'rollback-hold' | 'pin' | 'cache' | 'bundle';
export interface RuntimeSelection {
  version: string;
  reason: SelectionReason;
}
export function effectivePolicy(settings: UpdateSettings, run: RunPolicy): UpdateSettings {
  return {
    ...settings,
    mode: run.sourceCheckout ? 'off' : (run.mode ?? settings.mode),
    offline: settings.offline || run.offline === true,
  };
}
export function selectRuntime(
  settings: UpdateSettings,
  run: RunPolicy,
  cachedVersions: string[],
  bundleVersion: string,
  selectedVersion: string | null,
): RuntimeSelection {
  const exact = run.explicitVersion ?? settings.rollbackHold?.version ?? settings.pinnedVersion;
  if (exact) {
    if (exact !== bundleVersion && !cachedVersions.includes(exact))
      throw new RuntimeError(
        'RUNTIME_UNAVAILABLE',
        'The exact requested runtime is unavailable locally. Install that version explicitly before launching.',
        { version: exact },
      );
    return {
      version: exact,
      reason: run.explicitVersion ? 'explicit' : settings.rollbackHold ? 'rollback-hold' : 'pin',
    };
  }
  if (selectedVersion && cachedVersions.includes(selectedVersion))
    return { version: selectedVersion, reason: 'cache' };
  return { version: bundleVersion, reason: 'bundle' };
}
