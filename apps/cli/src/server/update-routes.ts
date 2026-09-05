import type { UpdatePolicy, SettingsAuthority } from '../../../../packages/project-fs/src/settings/schema.js';
import type { RunPolicy } from '../runtime/selection.js';
import type { Route } from './contracts.js';
import { requestBody, requiredText } from './request.js';
import { HttpError } from './security.js';
interface Status {
  policy: { mode: string; pinnedVersion: string | null; rollbackHold: unknown; offline: boolean };
  selection: { version: string; reason: string };
  runtime: { manifest: { version: string } };
  lastOutcome: { status?: string; pendingVersion?: string | null; message?: string } | null;
  configuredPolicy?: { mode: string; offline: boolean };
  rollback?: { version: string; eligible: boolean; reason: string };
}
export interface UpdaterApi {
  status(run?: RunPolicy): Promise<Status>;
  configure(value: Partial<UpdatePolicy>, authority: SettingsAuthority): Promise<unknown>;
  resume(authority: SettingsAuthority): Promise<unknown>;
  check(run?: RunPolicy): Promise<unknown>;
  install(run?: RunPolicy & { version?: string }): Promise<unknown>;
  rollback(run: RunPolicy & { version?: string }, authority: SettingsAuthority): Promise<unknown>;
}
export interface RuntimeIdentity {
  toolVersion: string;
  launcherVersion: string;
  bundledRuntimeVersion: string;
  sourceCheckout?: boolean;
  offline?: boolean;
}
export function updateRoutes(updater: UpdaterApi, identity: RuntimeIdentity): Route[] {
  const run: RunPolicy = {
    ...(identity.sourceCheckout ? { sourceCheckout: true } : {}),
    ...(identity.offline ? { offline: true } : {}),
  };
  const authority: SettingsAuthority = { scopes: ['manage-settings'] };
  return [
    {
      method: 'GET',
      path: '/api/updates',
      projectScoped: false,
      handler: async () => {
        const status = await updater.status(run);
        const availableVersion =
          status.lastOutcome?.status === 'available' ? (status.lastOutcome.pendingVersion ?? null) : null;
        const installationAllowed =
          !status.policy.offline &&
          !run.sourceCheckout &&
          !!availableVersion &&
          !status.policy.rollbackHold &&
          (!status.policy.pinnedVersion || status.policy.pinnedVersion === availableVersion);
        return {
          mode: status.configuredPolicy?.mode ?? status.policy.mode,
          pin: status.policy.pinnedVersion,
          rollbackHold: status.policy.rollbackHold,
          offline: status.policy.offline,
          configuredOffline: status.configuredPolicy?.offline ?? status.policy.offline,
          offlineForced: identity.offline === true,
          pendingVersion: status.selection.version !== identity.toolVersion ? status.selection.version : null,
          availableVersion,
          compatibility: 'Selected runtime passed compatibility checks.',
          checkEligible: !status.policy.offline && !run.sourceCheckout,
          installEligible: installationAllowed,
          rollbackEligible: status.rollback?.eligible ?? false,
          rollbackVersion: status.rollback?.version ?? null,
          rollbackReason: status.rollback?.reason ?? 'Rollback eligibility has not been reported.',
          versions: {
            launcherVersion: identity.launcherVersion,
            bundledRuntimeVersion: identity.bundledRuntimeVersion,
            selectedRuntimeVersion: status.selection.version,
            currentRuntimeVersion: identity.toolVersion,
          },
          selectionReason: status.selection.reason,
          lastOutcome: status.lastOutcome,
          sourceCheckout: identity.sourceCheckout ?? false,
        };
      },
    },
    {
      method: 'POST',
      path: '/api/updates/configure',
      projectScoped: false,
      handler: async (context) => {
        const body = requestBody(context);
        if (body.resume === true) {
          if (Object.keys(body).some((key) => key !== 'resume'))
            throw new HttpError(
              400,
              'INVALID_INPUT',
              'Resume the rollback hold separately from explicit policy edits.',
            );
          return updater.resume(authority);
        }
        const changes: Partial<UpdatePolicy> = {};
        if (body.mode !== undefined) {
          if (!['auto', 'notify', 'off'].includes(String(body.mode)))
            throw new HttpError(400, 'INVALID_INPUT', 'Choose auto, notify or off.');
          changes.mode = body.mode as UpdatePolicy['mode'];
        }
        if (body.pin !== undefined)
          changes.pinnedVersion = body.pin === null ? null : requiredText(body.pin, 'exact runtime pin', 80);
        if (body.offline !== undefined) {
          if (typeof body.offline !== 'boolean')
            throw new HttpError(400, 'INVALID_INPUT', 'Offline preference must be true or false.');
          changes.offline = body.offline;
        }
        if (body.online === true) {
          if (body.offline === true)
            throw new HttpError(400, 'INVALID_INPUT', 'Choose one consistent online or offline preference.');
          changes.offline = false;
        }
        if (!Object.keys(changes).length)
          throw new HttpError(400, 'INVALID_INPUT', 'Supply an explicit update setting change.');
        return updater.configure(changes, authority);
      },
    },
    { method: 'POST', path: '/api/updates/check', projectScoped: false, handler: () => updater.check(run) },
    {
      method: 'POST',
      path: '/api/updates/install',
      projectScoped: false,
      handler: (context) => {
        const body = requestBody(context);
        return updater.install({
          ...run,
          ...(body.version !== undefined
            ? { version: requiredText(body.version, 'runtime version', 80) }
            : {}),
        });
      },
    },
    {
      method: 'POST',
      path: '/api/updates/rollback',
      projectScoped: false,
      handler: (context) => {
        const body = requestBody(context);
        return updater.rollback(
          {
            ...run,
            ...(body.version !== undefined
              ? { version: requiredText(body.version, 'runtime version', 80) }
              : {}),
          },
          authority,
        );
      },
    },
  ];
}
