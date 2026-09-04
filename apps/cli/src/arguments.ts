import { parseArgs, type ParseArgsConfig } from 'node:util';
import type { Scope } from '@robopomelo/spec';
import { commandRegistry, type CommandName } from './command-registry.js';
export { commandRegistry } from './command-registry.js';
const strings = [
  'project',
  'runtime-version',
  'update-mode',
  'name',
  'example',
  'id',
  'proposal',
  'base-revision',
  'base-hash',
  'reference',
  'purpose',
  'title',
  'provenance',
  'related',
  'format',
  'include-evidence',
  'target',
  'actor',
  'source',
  'reason',
  'date',
  'reviewer',
  'mode',
  'pin',
  'change',
  'digest',
  'output',
  'scopes',
];
const booleans = [
  'version',
  'help',
  'json',
  'offline',
  'yes',
  'no-browser',
  'traceability',
  'all-evidence',
  'no-evidence',
  'apply',
  'clear-pin',
  'resume',
];
const options: NonNullable<ParseArgsConfig['options']> = { authorize: { type: 'string', multiple: true } };
for (const name of strings) options[name] = { type: 'string' };
for (const name of booleans) options[name] = { type: 'boolean' };
options.help = { type: 'boolean', short: 'h' };
const scopes = new Set<Scope>([
  'inspect',
  'author',
  'evidence',
  'export',
  'record-decisions',
  'manage-settings',
]);
export interface ParsedCommand {
  name: CommandName;
  positionals: string[];
  flags: Record<string, string | boolean | string[] | undefined>;
  scopes: Scope[];
  help: boolean;
  version: boolean;
}
export function parseCommand(argv: string[]): ParsedCommand {
  const parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true, tokens: true });
  const positionals = [...parsed.positionals];
  let name: CommandName = 'open';
  if (positionals.length) {
    const two = `${positionals[0]} ${positionals[1] ?? ''}`;
    const match =
      commandRegistry.find((command) => command.name === two) ??
      commandRegistry.find((command) => command.name === positionals[0]);
    if (!match) throw new Error(`Unknown command: ${positionals[0]}. Run robopomelo --help.`);
    name = match.name;
    positionals.splice(0, name.split(' ').length);
  }
  const flags = parsed.values as ParsedCommand['flags'];
  const version = flags.version === true;
  const globalFlags = new Set([
    'version',
    'help',
    'json',
    'offline',
    'yes',
    'project',
    'runtime-version',
    'update-mode',
    'authorize',
  ]);
  const commandFlags: Partial<Record<CommandName, string[]>> = {
    open: ['no-browser'],
    init: ['name', 'example'],
    show: ['id', 'traceability', 'change', 'digest'],
    'patch apply': ['proposal'],
    'history restore': ['base-revision', 'base-hash'],
    'evidence add': ['reference', 'purpose', 'title', 'provenance', 'related', 'base-revision', 'base-hash'],
    'evidence remove': ['base-revision', 'base-hash'],
    'review revoke': ['base-revision', 'base-hash', 'actor', 'source', 'reason', 'date'],
    export: ['format', 'include-evidence', 'all-evidence', 'no-evidence', 'output'],
    migrate: ['target', 'apply', 'base-revision', 'base-hash'],
    'trust grant': ['scopes', 'mode', 'actor'],
    'update configure': ['mode', 'pin', 'clear-pin', 'resume'],
  };
  for (const flag of Object.keys(flags))
    if (!globalFlags.has(flag) && !commandFlags[name]?.includes(flag))
      throw new Error(`Unsupported flag --${flag} for ${name}.`);
  const seen = new Map<string, string | undefined>();
  for (const token of parsed.tokens ?? []) {
    if (token.kind !== 'option' || token.name === 'authorize') continue;
    if (seen.has(token.name) && seen.get(token.name) !== token.value)
      throw new Error(`Conflicting --${token.name} values.`);
    seen.set(token.name, token.value);
  }
  const authorized = (Array.isArray(flags.authorize) ? flags.authorize : []).flatMap((value) =>
    value.split(','),
  );
  if (authorized.some((scope) => !scopes.has(scope as Scope)))
    throw new Error(
      'Unknown authorization scope. Use inspect, author, evidence, export, record-decisions or manage-settings.',
    );
  if (name === 'plan' && flags.json)
    throw new Error('plan is interactive. Use composable commands with --json.');
  if ([flags['all-evidence'], flags['no-evidence'], flags['include-evidence']].filter(Boolean).length > 1)
    throw new Error('Choose one evidence selection mode.');
  if (flags.pin && flags['clear-pin']) throw new Error('Choose pin or clear-pin, not both.');
  return {
    name,
    positionals,
    flags,
    scopes: [...new Set(authorized)] as Scope[],
    help: flags.help === true,
    version,
  };
}
