import { checkSchema, type ReviewCommand } from '@robopomelo/spec';
import { DomainError } from '@robopomelo/core';
import { digestValue } from '../../../../packages/project-fs/src/transactions/digest.js';
import { readInput } from '../input.js';
import { actor, arity, identity, inputPath, mutationResult, requireScope, text } from './common.js';
import type { CommandHandler } from './types.js';
export const review: CommandHandler = async (command, context) => {
  requireScope(command, context, 'record-decisions');
  arity(command, 1);
  let supplied: unknown;
  if (command.name === 'review revoke') {
    const base = identity(command),
      recorder = actor(command),
      source = text(command, 'source', true)!,
      recordedAt = text(command, 'date', true)!,
      reason = text(command, 'reason', true)!,
      snapshot = await context.project.snapshot();
    supplied = {
      formatVersion: '1.0.0',
      id: context.project.id(),
      projectId: snapshot.deployment.project.id,
      baseRevision: base.sourceRevision,
      baseHash: base.sourceHash,
      actor: recorder,
      purpose: reason,
      input: {
        action: 'revoke',
        record: {
          id: context.project.id(),
          approvalId: command.positionals[0]!,
          actor: recorder,
          reason,
          source,
          recordedAt,
        },
      },
    };
  } else supplied = await readInput(inputPath(command.positionals[0]!, context), context.stdin);
  const errors = checkSchema(supplied, 'review');
  if (errors.length)
    throw new DomainError(
      'INVALID_INPUT',
      'Supply a complete ReviewCommand with the exact decision, identity, date and provenance.',
      errors,
    );
  const envelope = supplied as ReviewCommand;
  if (envelope.input.action !== command.name.split(' ')[1])
    throw new DomainError('INVALID_INPUT', 'Review file action does not match the selected command.');
  return context.project.withProject(async (selected) => {
    const mutation = { kind: 'review' as const, review: envelope },
      prior = await context.project
        .requireSession(selected)
        .mutationStatus(envelope.id, digestValue(mutation));
    return mutationResult(await context.project.review(envelope), envelope.id, prior.status === 'committed', {
      sourceRevision: envelope.baseRevision,
      sourceHash: envelope.baseHash,
    });
  });
};
