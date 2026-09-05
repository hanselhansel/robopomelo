import { resolve, basename } from 'node:path';
import { stat } from 'node:fs/promises';
import { DomainError } from '@robopomelo/core';
import type { ParsedCommand } from './arguments.js';
import type { CommandName } from './command-registry.js';
import { helpText } from './help.js';
import { successEnvelope, type CliEnvelope } from './output.js';
import type { CommandContext, CommandHandler, CommandResult } from './commands/types.js';
import { arity, text, requireScope } from './commands/common.js';
import { show, validate } from './commands/read.js';
import { patch } from './commands/patch.js';
import { history } from './commands/history.js';
import { evidence } from './commands/evidence.js';
import { exportCommand } from './commands/export.js';
import { trust } from './commands/trust.js';
import { migrate } from './commands/migrate.js';
import { capabilityCommand, doctor } from './commands/inspect.js';
import { review } from './commands/review.js';
import { update } from './commands/update.js';
export type { CommandContext, CommandResult } from './commands/types.js';
export const handlers: Record<Exclude<CommandName, 'open' | 'plan' | 'init'>, CommandHandler> = {
  show,
  validate,
  'patch check': patch,
  'patch diff': patch,
  'patch apply': patch,
  'history list': history,
  'history show': history,
  'history restore': history,
  'history reconcile': history,
  'history recover': history,
  'history retire': history,
  'evidence add': evidence,
  'evidence list': evidence,
  'evidence check': evidence,
  'evidence remove': evidence,
  export: exportCommand,
  'trust show': trust,
  'trust grant': trust,
  'trust revoke': trust,
  'trust forget': trust,
  migrate,
  capabilities: capabilityCommand,
  doctor,
  'review acknowledge': review,
  'review waive': review,
  'review approve': review,
  'review revoke': review,
  'update check': update,
  'update install': update,
  'update rollback': update,
  'update configure': update,
};
const projectless = new Set<CommandName>([
  'open',
  'plan',
  'init',
  'capabilities',
  'doctor',
  'update check',
  'update install',
  'update rollback',
  'update configure',
]);
export async function executeCommand(
  command: ParsedCommand,
  context: CommandContext,
): Promise<CommandResult> {
  if (command.help) return { data: { help: helpText(command.name) } };
  if (command.version)
    throw new DomainError(
      'INVALID_ARGUMENTS',
      'Version handling belongs to the read-only launcher entrypoint.',
    );
  const cwd = context.cwd ?? process.cwd();
  if (
    ['open', 'plan', 'init'].includes(command.name) &&
    command.flags.project &&
    command.positionals[0] &&
    resolve(cwd, String(command.flags.project)) !== resolve(cwd, command.positionals[0])
  )
    throw new DomainError('INVALID_ARGUMENTS', 'Positional folder and --project select different roots.');
  if (command.name === 'init') {
    arity(command, 1);
    requireScope(command, context, 'author', true);
    const example = text(command, 'example');
    if (example && example !== 'inbound-pallet')
      throw new DomainError('INVALID_ARGUMENTS', 'Choose --example inbound-pallet.');
    await context.project.create(
      resolve(cwd, command.positionals[0]!),
      text(command, 'name') ?? basename(command.positionals[0]!),
      !!example,
      command.scopes,
    );
    return {
      data: { status: 'created', ...context.project.status() },
      snapshot: await context.project.snapshot(),
    };
  }
  if (command.name === 'open' || command.name === 'plan') {
    arity(command, 0, 1);
    if (command.name === 'plan' && (!context.isTTY || command.flags.json))
      throw new DomainError(
        'INVALID_ARGUMENTS',
        'plan requires a TTY and does not accept --json. Use the composable commands.',
      );
    const action = context[command.name];
    if (!action)
      throw new DomainError(
        'UNSUPPORTED_CAPABILITY',
        `${command.name} requires the application entrypoint callback.`,
      );
    return action(command, context);
  }
  if (!projectless.has(command.name) || (command.name === 'doctor' && command.flags.project)) {
    const path = text(command, 'project') ?? context.project.current?.root.identity().canonicalPath ?? cwd;
    try {
      if (!(await stat(resolve(cwd, path, 'deployment.yaml'))).isFile()) throw new Error('missing');
    } catch {
      throw new DomainError('PROJECT_NOT_OPEN', 'Select an existing project using --project <folder>.');
    }
    await context.project.open(resolve(cwd, path), command.scopes);
  }
  const handler = handlers[command.name];
  if (!handler) throw new DomainError('UNSUPPORTED_COMMAND', `No handler is registered for ${command.name}.`);
  return handler(command, context);
}

export function resultEnvelope(
  command: string,
  result: CommandResult,
  toolVersion: string,
): CliEnvelope<unknown> {
  const envelope = successEnvelope(command, result.data, {
    toolVersion,
    ...(result.snapshot ? { snapshot: result.snapshot } : {}),
  });
  return {
    ...envelope,
    ok: (result.ok ?? true) && (result.exitCode ?? 0) === 0,
    findings: result.findings ?? envelope.findings,
    sourceRevision: result.sourceRevision === undefined ? envelope.sourceRevision : result.sourceRevision,
    sourceHash: result.sourceHash === undefined ? envelope.sourceHash : result.sourceHash,
    specVersion: result.specVersion === undefined ? envelope.specVersion : result.specVersion,
  };
}
