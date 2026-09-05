import { checkSchema, type PatchEnvelope } from '@robopomelo/spec';
import { DomainError } from '@robopomelo/core';
import { digestValue } from '../../../../packages/project-fs/src/transactions/digest.js';
import { readInput } from '../input.js';
import { arity, identity, inputPath, mutationResult, text } from './common.js';
import type { CommandHandler } from './types.js';
export const patch: CommandHandler = async (command, context) => {
  const proposal = text(command, 'proposal');
  if (proposal) {
    arity(command, 0);
    const expected = identity(command),
      digest = text(command, 'digest', true)!;
    return context.project.withProject(async (selected) => {
      const session = context.project.requireSession(selected),
        stored = await session.proposalRead(proposal),
        prior = await session.mutationStatus(proposal, stored.requestDigest);
      const result = await session.applyStoredProposal(proposal, {
        expected,
        authorization: context.project.authorization(selected),
        approvedPatchDigest: digest,
      });
      return mutationResult(result, proposal, prior.status === 'committed', expected);
    });
  }
  arity(command, 1);
  const value = await readInput(inputPath(command.positionals[0]!, context), context.stdin);
  const errors = checkSchema(value, 'patch');
  if (errors.length)
    throw new DomainError('INVALID_INPUT', 'Patch file must contain a valid complete PatchEnvelope.', errors);
  const input = value as PatchEnvelope;
  return context.project.withProject(async (selected) => {
    const session = context.project.requireSession(selected),
      authorization = context.project.authorization(selected),
      mutation = { kind: 'patch' as const, patch: input };
    if (command.name !== 'patch apply') {
      const snapshot = await context.project.snapshot();
      if (snapshot.sourceRevision !== input.baseRevision || snapshot.sourceHash !== input.baseHash)
        throw new DomainError('STALE_BASE', 'Patch preview source differs from its declared base.');
      const evaluated = await session.preview({
        expected: { sourceRevision: input.baseRevision, sourceHash: input.baseHash },
        idempotencyKey: input.id,
        authorization,
        actor: input.actor,
        mutation,
      });
      return {
        data: {
          status: 'valid',
          diff: evaluated.diff,
          validation: evaluated.validation,
          invalidatedApprovalIds: evaluated.invalidatedApprovalIds,
        },
        snapshot,
      };
    }
    const prior = await session.mutationStatus(input.id, digestValue(mutation));
    return mutationResult(await context.project.apply(input), input.id, prior.status === 'committed', {
      sourceRevision: input.baseRevision,
      sourceHash: input.baseHash,
    });
  });
};
