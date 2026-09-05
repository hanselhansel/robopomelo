import { DomainError } from '@robopomelo/core';
import type { UpdatePolicy } from '../../../../packages/project-fs/src/settings/schema.js';
import { UpdatePreferences } from '../../../../packages/project-fs/src/settings/updates.js';
import type { RunPolicy } from '../runtime/selection.js';
import { arity, requireScope, text } from './common.js';
import type { CommandHandler } from './types.js';
export const update: CommandHandler = async (command, context) => {
  const mode = text(command, 'update-mode');
  if (mode && !['auto', 'notify', 'off'].includes(mode))
    throw new DomainError('INVALID_ARGUMENTS', '--update-mode must be auto, notify or off.');
  const version = text(command, 'runtime-version'),
    run: RunPolicy = {
      ...(context.bundledRuntimeVersion === '0.0.0' ? { sourceCheckout: true } : {}),
      ...(command.flags.offline ? { offline: true } : {}),
      ...(mode ? { mode: mode as UpdatePolicy['mode'] } : {}),
      ...(version ? { explicitVersion: version } : {}),
    };
  if (command.name === 'update configure') {
    arity(command, 0);
    requireScope(command, context, 'manage-settings', true);
    const preferences = new UpdatePreferences(context.project.settings),
      authority = { scopes: command.scopes };
    const configuredMode = text(command, 'mode'),
      pin = text(command, 'pin'),
      clear = command.flags['clear-pin'] === true,
      online = command.flags.online === true;
    if (configuredMode && !['auto', 'notify', 'off'].includes(configuredMode))
      throw new DomainError('INVALID_ARGUMENTS', '--mode must be auto, notify or off.');
    if (pin && clear) throw new DomainError('INVALID_ARGUMENTS', 'Choose --pin or --clear-pin.');
    if (command.flags.resume) {
      if (configuredMode || pin || clear || online)
        throw new DomainError(
          'INVALID_ARGUMENTS',
          'Resume the rollback hold separately from explicit policy edits.',
        );
      return {
        data: {
          policy: context.updater
            ? await context.updater.resume(authority)
            : await preferences.resume(authority),
        },
      };
    }
    const patch: Partial<UpdatePolicy> = {
      ...(configuredMode ? { mode: configuredMode as UpdatePolicy['mode'] } : {}),
      ...(pin ? { pinnedVersion: pin } : {}),
      ...(clear ? { pinnedVersion: null } : {}),
      ...(online ? { offline: false } : {}),
    };
    return {
      data: {
        policy: Object.keys(patch).length
          ? context.updater
            ? await context.updater.configure(patch, authority)
            : await preferences.configure(patch, authority)
          : await preferences.read(),
      },
    };
  }
  arity(command, 0, command.name === 'update check' ? 0 : 1);
  const target = text(command, 'target');
  if (target && command.positionals[0] && target !== command.positionals[0])
    throw new DomainError('INVALID_ARGUMENTS', 'Positional runtime version and --target conflict.');
  const requested = target ?? command.positionals[0];
  if (command.name === 'update rollback' || command.name === 'update install')
    requireScope(command, context, 'manage-settings', true);
  if (!context.updater)
    throw new DomainError(
      'RUNTIME_REQUIRED',
      'This update operation requires an installed launcher with its verified runtime cache.',
    );
  try {
    const data =
      command.name === 'update check'
        ? await context.updater.check(run)
        : command.name === 'update install'
          ? await context.updater.install({ ...run, ...(requested ? { version: requested } : {}) })
          : await context.updater.rollback(
              { ...run, ...(requested ? { version: requested } : {}) },
              { scopes: command.scopes },
            );
    return { data };
  } catch (error) {
    const code = String((error as { code?: string }).code ?? '');
    if (/SCOPE|UNSUPPORTED|INCOMPATIBLE|RUNTIME_UNAVAILABLE/.test(code)) throw error;
    throw new DomainError(
      'UPDATE_FAILED',
      error instanceof Error ? error.message : 'The update operation failed.',
      { code },
    );
  }
};
