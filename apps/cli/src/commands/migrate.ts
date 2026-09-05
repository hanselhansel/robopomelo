import { DomainError } from '@robopomelo/core';
import { MigrationService } from '../../../../packages/project-fs/src/migrate.js';
import { actor, arity, identity, requireScope, text } from './common.js';
import type { CommandHandler } from './types.js';
export const migrate: CommandHandler = async (command, context) => {
  arity(command, 0);
  const target = text(command, 'target', true)!;
  return context.project.withProject(async (selected) => {
    const service = new MigrationService(context.project.requireSession(selected));
    if (!command.flags.apply) return { data: await service.preview(target) };
    requireScope(command, context, 'author');
    const expected = identity(command),
      suppliedActor = actor(command),
      plan = await service.preview(target);
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
