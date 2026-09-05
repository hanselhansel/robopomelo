import { DomainError } from '@robopomelo/core';
import { isHash } from '../../../../packages/project-fs/src/transactions/metadata.js';
import { actor, arity, identity, mutationId, mutationResult, text } from './common.js';
import type { CommandHandler } from './types.js';
export const history: CommandHandler = async (command, context) =>
  context.project.withProject(async (selected) => {
    const session = context.project.requireSession(selected);
    if (command.name === 'history list') {
      arity(command, 0);
      return {
        data: command.flags.proposals
          ? { proposals: await session.proposalList() }
          : { revisions: await session.historyList() },
      };
    }
    if (command.name === 'history show') {
      arity(command, 1);
      const recorded = await session.historyRead(command.positionals[0]!);
      return { data: recorded, snapshot: recorded.snapshot };
    }
    if (command.name === 'history recover') {
      arity(command, 0);
      const results = await session.recover(),
        blocked = results.some((r) => r.kind === 'uncommitted' || r.kind === 'indeterminate');
      return {
        data: { status: blocked ? 'action-required' : 'checked', results },
        ok: !blocked,
        exitCode: blocked ? 6 : 0,
      };
    }
    if (command.name === 'history restore') {
      arity(command, 1);
      const id = mutationId(command, context),
        expected = identity(command);
      return mutationResult(
        await context.project.restore(
          command.positionals[0]!,
          expected,
          actor(command),
          text(command, 'reason', true)!,
          id,
        ),
        id,
        false,
        expected,
      );
    }
    if (command.name === 'history reconcile') {
      arity(command, 0);
      const hash = text(command, 'base-hash', true)!;
      if (!isHash(hash))
        throw new DomainError('INVALID_ARGUMENTS', 'Supply the current --base-hash from show.');
      const id = mutationId(command, context),
        base = await context.project.snapshot();
      return mutationResult(
        await session.reconcileExternal(
          hash,
          actor(command),
          context.project.authorization(selected),
          id,
          text(command, 'reason'),
        ),
        id,
        false,
        base.sourceHash === hash ? { sourceRevision: base.sourceRevision, sourceHash: hash } : undefined,
      );
    }
    arity(command, 1);
    const alias = text(command, 'change');
    if (alias && alias !== command.positionals[0])
      throw new DomainError('INVALID_ARGUMENTS', '--change must match the positional retirement ID.');
    const expected = identity(command),
      snapshot = await context.project.snapshot();
    if (expected.sourceHash !== snapshot.sourceHash || expected.sourceRevision !== snapshot.sourceRevision)
      throw new DomainError('STALE_BASE', 'Retirement source differs from the explicit base.');
    return {
      data: await session.retirePrepared(command.positionals[0]!, text(command, 'digest', true)!, {
        authorization: context.project.authorization(selected),
        actor: actor(command),
        reason: text(command, 'reason', true)!,
      }),
      snapshot,
    };
  });
