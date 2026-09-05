import { resolve } from 'node:path';
import type { Actor, Scope } from '@robopomelo/spec';
import { DomainError } from '@robopomelo/core';
import type { ParsedCommand } from '../arguments.js';
import type { CommandContext, CommandResult } from './types.js';
import type { CommitResult, SourceIdentity } from '../../../../packages/project-fs/src/contracts.js';
import { isHash, isId, validActor } from '../../../../packages/project-fs/src/transactions/metadata.js';
export function text(command: ParsedCommand, flag: string, required = false): string | undefined {
  const value = command.flags[flag];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !value.trim())
    throw new DomainError('INVALID_ARGUMENTS', `Supply --${flag} with a nonempty value.`);
  return value;
}
export function arity(command: ParsedCommand, min: number, max = min): void {
  if (command.positionals.length < min || command.positionals.length > max)
    throw new DomainError(
      'INVALID_ARGUMENTS',
      `Run robopomelo ${command.name} --help for the required positional inputs.`,
    );
}
export const inputPath = (path: string, context: CommandContext) =>
  path === '-' ? path : resolve(context.cwd ?? process.cwd(), path);
export function identity(command: ParsedCommand) {
  const sourceRevision = text(command, 'base-revision', true)!,
    sourceHash = text(command, 'base-hash', true)!;
  if (!isId(sourceRevision) || !isHash(sourceHash))
    throw new DomainError(
      'INVALID_ARGUMENTS',
      'Supply exact --base-revision and SHA-256 --base-hash from show.',
    );
  return { sourceRevision, sourceHash };
}
export function actor(command: ParsedCommand): Actor {
  let value: unknown;
  try {
    value = JSON.parse(text(command, 'actor', true)!);
  } catch {
    throw new DomainError('INVALID_ARGUMENTS', 'Supply --actor as JSON with explicit kind and name.');
  }
  if (!validActor(value))
    throw new DomainError('INVALID_ARGUMENTS', 'Actor JSON must use the shared actor contract.');
  const source = text(command, 'source');
  if (source && value.source && value.source !== source)
    throw new DomainError('INVALID_ARGUMENTS', 'Actor source and --source conflict.');
  return { ...value, ...(source ? { source } : {}) };
}
export function requireScope(
  command: ParsedCommand,
  context: CommandContext,
  scope: Scope,
  explicit = false,
): void {
  if (!command.scopes.includes(scope) && (explicit || !context.project.status().scopes?.includes(scope)))
    throw new DomainError(
      'SCOPE_REQUIRED',
      `This operation requires --authorize ${scope}${explicit ? '' : ' or an existing matching project grant'}. --yes does not grant authority.`,
    );
}
export function mutationId(command: ParsedCommand, context: CommandContext): string {
  const id = text(command, 'change') ?? context.project.id();
  if (!isId(id)) throw new DomainError('INVALID_ARGUMENTS', 'Mutation ID must be a valid stable ID.');
  return id;
}
export function mutationResult(
  result: CommitResult,
  changeId: string,
  already = false,
  base?: SourceIdentity,
): CommandResult {
  if (result.kind === 'conflict')
    return {
      data: { status: 'conflict', changeId, ...result },
      ok: false,
      exitCode: 4,
      sourceRevision: result.current.sourceRevision,
      sourceHash: result.current.sourceHash,
    };
  if (result.kind === 'committed')
    return {
      data: {
        status: already || result.alreadyApplied ? 'already-applied' : 'applied',
        changeId,
        readiness: result.snapshot.validation.readiness,
        approvalStatus: result.snapshot.approvalStatus,
        diff: result.diff,
        receiptDigest: result.receiptDigest,
      },
      snapshot: result.snapshot,
    };
  return {
    ...(base ? { sourceRevision: base.sourceRevision, sourceHash: base.sourceHash } : {}),
    specVersion: result.validation.specVersion,
    findings: result.validation.findings,
    data: {
      status: 'proposed',
      changeId,
      proposalId: result.proposalId,
      patchDigest: result.patchDigest,
      receiptDigest: result.receiptDigest,
      diff: result.diff,
      readiness: result.validation.readiness,
      approvalStatus: result.approvalStatus,
      validation: result.validation,
    },
  };
}
