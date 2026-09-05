import { DomainError } from '@robopomelo/core';
import { resolve } from 'node:path';
import { SafeRoot } from '../../../../packages/project-fs/src/fs/safe-fs.js';
import { MigrationService } from '../../../../packages/project-fs/src/migrate.js';
import { actor, arity, identity, requireScope, text } from './common.js';
import type { CommandHandler } from './types.js';
export const migrate: CommandHandler = async (command, context) => {
  arity(command, 0);
  const target = text(command, 'target'),
    recover = text(command, 'recover'),
    restore = text(command, 'restore-backup');
  if ([target, recover, restore].filter(Boolean).length !== 1)
    throw new DomainError(
      'INVALID_ARGUMENTS',
      'Choose exactly one migration target, recovery manifest or backup restore.',
    );
  if (!restore && command.flags.destination)
    throw new DomainError('INVALID_ARGUMENTS', '--destination belongs to --restore-backup.');
  if (
    (recover || restore) &&
    ['apply', 'base-revision', 'base-hash', 'reason', 'change'].some(
      (flag) => command.flags[flag] !== undefined,
    )
  )
    throw new DomainError(
      'INVALID_ARGUMENTS',
      'Recovery modes use the verified backup manifest, not migration apply flags.',
    );
  if (recover && (command.flags.actor || command.flags.source))
    throw new DomainError(
      'INVALID_ARGUMENTS',
      'Recovery preserves the recorded migration actor; do not supply a replacement actor.',
    );
  return context.project.withProject(async (selected) => {
    const service = new MigrationService(context.project.requireSession(selected));
    if (recover) return { data: await service.recover(recover) };
    if (restore) {
      requireScope(command, context, 'author', true);
      const suppliedActor = actor(command),
        destination = await SafeRoot.open(
          resolve(context.cwd ?? process.cwd(), text(command, 'destination', true)!),
        );
      try {
        const result = await service.restoreBackup(restore, destination, {
          authorization: context.project.authorization(selected),
          actor: suppliedActor,
        });
        return {
          data: { ...result, destination: destination.identity().canonicalPath },
          sourceHash: result.sourceHash,
          sourceRevision: result.sourceRevision,
        };
      } finally {
        await destination.close();
      }
    }
    if (!command.flags.apply) return { data: await service.preview(target!) };
    requireScope(command, context, 'author');
    const expected = identity(command),
      suppliedActor = actor(command),
      plan = await service.preview(target!);
    if (plan.sourceRevision !== expected.sourceRevision || plan.sourceHash !== expected.sourceHash)
      throw new DomainError('STALE_BASE', 'Migration preview differs from the explicit source base.');
    if (plan.kind === 'noop') return { data: plan, snapshot: await context.project.snapshot() };
    return {
      data: await service.apply(plan.previewId, {
        authorization: context.project.authorization(selected),
        actor: suppliedActor,
        backup: true,
      }),
      snapshot: await context.project.snapshot(),
    };
  });
};
