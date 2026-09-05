import { DomainError } from '@robopomelo/core';
import type { Evidence } from '@robopomelo/spec';
import {
  EvidenceService,
  type EvidenceMetadata,
} from '../../../../packages/project-fs/src/evidence/service.js';
import { FileSelection } from '../../../../packages/project-fs/src/evidence/selection.js';
import {
  actor,
  arity,
  identity,
  inputPath,
  mutationId,
  mutationResult,
  requireScope,
  text,
} from './common.js';
import type { CommandHandler } from './types.js';
export const evidence: CommandHandler = async (command, context) =>
  context.project.withProject(async (selected) => {
    const service = new EvidenceService(context.project.requireSession(selected));
    if (command.name === 'evidence list') {
      arity(command, 0);
      const snapshot = await context.project.snapshot();
      return { data: { evidence: snapshot.deployment.evidence }, snapshot };
    }
    if (command.name === 'evidence check') {
      arity(command, 0);
      const observations = await service.observe();
      return { data: { observations }, snapshot: await context.project.snapshot() };
    }
    const expected = identity(command),
      suppliedActor = actor(command),
      id = mutationId(command, context),
      authorization = context.project.authorization(selected);
    if (command.name === 'evidence remove') {
      arity(command, 1);
      const snapshot = await context.project.snapshot(),
        record = snapshot.deployment.evidence.find((e) => e.id === command.positionals[0]);
      if (!record) throw new DomainError('INVALID_RECORD', 'No evidence has this stable ID.');
      return mutationResult(
        await service.remove(record.id, {
          expected,
          mutationId: id,
          authorization,
          actor: suppliedActor,
          metadata: {
            title: text(command, 'reason') ?? `Remove evidence ${record.id}`,
            purpose: record.purpose,
            provenance: record.provenance,
            relatedIds: record.relatedIds,
          },
        }),
        id,
        false,
        expected,
      );
    }
    const reference = text(command, 'reference');
    arity(command, reference ? 0 : 1);
    const purpose = text(command, 'purpose', true)!;
    if (!['planning', 'acceptance-requirement', 'decision'].includes(purpose))
      throw new DomainError(
        'INVALID_ARGUMENTS',
        'Evidence purpose must be planning, acceptance-requirement or decision.',
      );
    const metadata: EvidenceMetadata = {
      purpose: purpose as Evidence['purpose'],
      title: text(command, 'title', true)!,
      provenance: { state: 'provided', value: text(command, 'provenance', true)! },
      relatedIds: text(command, 'related')?.split(',') ?? [],
    };
    const input = { expected, mutationId: id, authorization, actor: suppliedActor, metadata };
    if (reference)
      return mutationResult(
        await service.reference(input, { kind: 'external', uri: reference }),
        id,
        false,
        expected,
      );
    const path = command.positionals[0]!;
    if (path === '-')
      throw new DomainError(
        'INVALID_ARGUMENTS',
        'Evidence copy requires an explicit regular file path. Use - for patch/review JSON, or ./- for a file named -.',
      );
    requireScope(command, context, 'evidence');
    const selection = await FileSelection.open(inputPath(path, context));
    try {
      return mutationResult(await service.addFile(selection, input), id, false, expected);
    } finally {
      await selection.close();
    }
  });
