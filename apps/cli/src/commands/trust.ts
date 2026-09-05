import { DomainError } from '@robopomelo/core';
import { validateScopes } from '../../../../packages/project-fs/src/settings/schema.js';
import { arity, requireScope, text } from './common.js';
import type { CommandHandler } from './types.js';
export const trust: CommandHandler = async (command, context) => {
  arity(command, 0);
  if (command.name === 'trust show')
    return context.project.withProject(async (selected) => ({
      data: {
        root: selected.root.identity(),
        grant: selected.writeGrant,
        effectiveScopes: context.project.status().scopes ?? ['inspect'],
        mode: selected.writeGrant?.mode ?? 'autonomous',
      },
    }));
  requireScope(command, context, 'manage-settings', true);
  if (command.name === 'trust grant') {
    const scopes = text(command, 'scopes', true)!.split(',');
    try {
      validateScopes(scopes);
    } catch {
      throw new DomainError('INVALID_ARGUMENTS', 'Supply valid shared scopes to --scopes.');
    }
    const mode = text(command, 'mode') ?? 'autonomous';
    if (mode !== 'autonomous' && mode !== 'review-each-change')
      throw new DomainError('INVALID_ARGUMENTS', 'Trust mode must be autonomous or review-each-change.');
    return { data: await context.project.grant(scopes, mode, true) };
  }
  if (command.name === 'trust forget') return { data: await context.project.forget() };
  // A per-run manage-settings grant must not hide the persisted grant being revoked.
  await context.project.withProject(async (selected) => {
    if (selected.projectId) {
      const binding = { ...selected.root.identity(), projectId: selected.projectId };
      for (const grant of await context.project.trust.show(binding))
        if (!grant.revokedAt) await context.project.trust.revoke(grant.grantId, { scopes: command.scopes });
    }
  });
  return { data: await context.project.revoke() };
};
