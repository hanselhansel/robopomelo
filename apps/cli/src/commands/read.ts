import { buildReferenceIndex, traceability, validateDeployment, sha256, DomainError } from '@robopomelo/core';
import { parseSource } from '../../../../packages/project-fs/src/yaml/parse.js';
import type { CommandHandler } from './types.js';
import { arity, text } from './common.js';
export const show: CommandHandler = async (command, context) => {
  arity(command, 0);
  const id = text(command, 'id'),
    change = text(command, 'change'),
    digest = text(command, 'digest');
  if (
    [id, change, command.flags.traceability].filter(Boolean).length > 1 ||
    Boolean(change) !== Boolean(digest)
  )
    throw new DomainError('INVALID_ARGUMENTS', 'Choose one show mode and pair --change with --digest.');
  if (change)
    return context.project.withProject(async (selected) => {
      const receipt = await context.project.requireSession(selected).mutationStatus(change, digest!);
      return {
        data: receipt,
        ...(receipt.status === 'committed'
          ? { sourceRevision: receipt.sourceRevision, sourceHash: receipt.sourceHash }
          : {}),
      };
    });
  const result = await context.project.read();
  if (result.kind === 'inspection') return { data: result };
  const snapshot = result.snapshot;
  if (id) {
    if (snapshot.validation.findings.some((f) => f.ruleId === 'RP-002'))
      throw new DomainError('SOURCE_UNREADABLE', 'Resolve duplicate stable IDs before selecting one record.');
    const entry = buildReferenceIndex(snapshot.deployment).get(id);
    if (!entry) throw new DomainError('INVALID_RECORD', 'No record has this stable ID.');
    return { data: { record: entry.record, collection: entry.collection, path: entry.path }, snapshot };
  }
  return {
    data: command.flags.traceability ? { traceability: traceability(snapshot.deployment) } : snapshot,
    snapshot,
  };
};
export const validate: CommandHandler = async (command, context) => {
  arity(command, 0);
  const read = await context.project.read();
  if (read.kind === 'readable')
    return {
      data: read.snapshot.validation,
      snapshot: read.snapshot,
      ok: read.snapshot.validation.readiness !== 'blocked',
      exitCode: read.snapshot.validation.readiness === 'blocked' ? 3 : 0,
    };
  return context.project.withProject(async (selected) => {
    const bytes = await selected.root.readFile('deployment.yaml'),
      sourceHash = sha256(bytes);
    let value: unknown = null;
    let problems = read.problems;
    try {
      value = parseSource(bytes).value;
    } catch (error) {
      const e = error as { code?: string; message?: string; line?: number; column?: number };
      problems = [
        {
          code: e.code ?? 'SOURCE_UNREADABLE',
          message: e.message ?? 'Invalid source',
          ...(e.line === undefined ? {} : { line: e.line }),
          ...(e.column === undefined ? {} : { column: e.column }),
        },
      ];
    }
    const report = validateDeployment(value, {
      sourceRevision: null,
      sourceHash,
      toolVersion: context.toolVersion,
      evidence: [],
    });
    return {
      data: { ...report, problems },
      ok: false,
      exitCode: 3,
      findings: report.findings,
      sourceRevision: null,
      sourceHash,
      specVersion: report.specVersion,
    };
  });
};
