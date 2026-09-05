import { generateArtifacts } from '@robopomelo/artifacts';
import { DomainError, sha256 } from '@robopomelo/core';
import { ExportService } from '../../../../packages/project-fs/src/export/service.js';
import { arity, text } from './common.js';
import type { CommandHandler } from './types.js';
export const exportCommand: CommandHandler = async (command, context) => {
  arity(command, 0);
  const ids = text(command, 'include-evidence');
  if ([ids, command.flags['all-evidence'], command.flags['no-evidence']].filter(Boolean).length !== 1)
    throw new DomainError(
      'INVALID_ARGUMENTS',
      'Choose --no-evidence, --all-evidence or --include-evidence <ids> explicitly.',
    );
  const format = text(command, 'format') ?? 'zip';
  if (format !== 'zip' && format !== 'files')
    throw new DomainError('INVALID_ARGUMENTS', 'Export format must be zip or files.');
  return context.project.withProject(async (selected) => {
    const snapshot = await context.project.snapshot(),
      source = (await selected.root.readFile('deployment.yaml')).toString('utf8');
    if (sha256(source) !== snapshot.sourceHash)
      throw new DomainError(
        'STALE_BASE',
        'Source changed while preparing the export. Retry from the current snapshot.',
      );
    const selectedEvidenceIds = ids
      ? ids.split(',')
      : command.flags['all-evidence']
        ? snapshot.deployment.evidence.filter((e) => e.location.kind === 'attachment').map((e) => e.id)
        : [];
    let plan;
    try {
      plan = generateArtifacts({ source, snapshot, selectedEvidenceIds });
    } catch (error) {
      throw new DomainError(
        'EXPORT_IO',
        error instanceof Error ? error.message : 'Artifact generation failed.',
      );
    }
    const exporter = new ExportService(context.project.requireSession(selected)),
      authorization = context.project.authorization(selected),
      preview = await exporter.preview(
        plan,
        { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash },
        authorization,
      ),
      name = text(command, 'output');
    return {
      data: await exporter.persist(preview.previewId, { format, authorization, ...(name ? { name } : {}) }),
      snapshot,
    };
  });
};
