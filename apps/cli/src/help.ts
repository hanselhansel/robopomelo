import { commandRegistry, commandFlags, globalFlags, flagDefinitions } from './arguments.js';
import type { CommandName } from './command-registry.js';
const argumentsByCommand: Partial<Record<CommandName, string>> = {
  open: '[folder]',
  plan: '[folder]',
  init: '<folder>',
  show: '[--id <id> | --traceability | --change <id> --digest <sha256>]',
  'patch check': '<file|->',
  'patch diff': '<file|->',
  'patch apply':
    '[file|-] [--proposal <id> --digest <sha256> --base-revision <revision> --base-hash <sha256>]',
  'history show': '<revision>',
  'history restore':
    '<revision> --base-revision <revision> --base-hash <sha256> --actor <json> --reason <text>',
  'history reconcile': '--base-hash <sha256> --actor <json>',
  'history retire': '<change> --digest <sha256> --actor <json> --reason <text>',
  'evidence add':
    '[file] [--reference <uri>] --purpose <planning|acceptance-requirement|decision> --title <text> --provenance <text> --base-revision <revision> --base-hash <sha256> --actor <json>',
  'evidence remove': '<id> --base-revision <revision> --base-hash <sha256> --actor <json>',
  'review acknowledge': '<file|->',
  'review waive': '<file|->',
  'review approve': '<file|->',
  'review revoke':
    '<approval-id> --actor <json> --source <text> --reason <text> --date <date-time> --base-revision <revision> --base-hash <sha256>',
  export: '--no-evidence | --all-evidence | --include-evidence <ids>',
  migrate:
    '--target <spec-version> [--apply --base-revision <revision> --base-hash <sha256> --actor <json>] | --recover <manifest> | --restore-backup <manifest> --destination <empty-folder> --actor <json> --authorize author',
  'trust grant': '--scopes <scopes> --mode <autonomous|review-each-change> [--remember]',
  'update install': '[version] [--target <version>]',
  'update rollback': '[version] [--target <version>]',
  'update configure': '[--mode auto|notify|off] [--pin <version> | --clear-pin] [--resume] [--online]',
};
const examples: Partial<Record<CommandName, string[]>> = {
  init: ['robopomelo init demo --example inbound-pallet --authorize author --yes'],
  'patch check': ['robopomelo patch check patch.json --project demo --authorize author --json'],
  'patch diff': ['robopomelo patch diff patch.json --project demo --authorize author --json'],
  'patch apply': ['robopomelo patch apply - --project demo --authorize author --json'],
  export: ['robopomelo export --project demo --format files --no-evidence --authorize export --yes'],
  'trust grant': [
    'robopomelo trust grant --project demo --scopes author,evidence,export --mode autonomous --remember --authorize manage-settings',
  ],
  'update install': ['robopomelo update install --target 1.0.0 --authorize manage-settings'],
  'update rollback': ['robopomelo update rollback --authorize manage-settings'],
  'update configure': [
    'robopomelo update configure --mode auto --authorize manage-settings',
    'robopomelo update configure --resume --authorize manage-settings',
  ],
  'review approve': [
    'robopomelo review approve decision.json --project demo --authorize record-decisions --json',
  ],
};
export function commandHelp(name: CommandName) {
  const definition = commandRegistry.find((c) => c.name === name)!;
  return {
    ...definition,
    usage: `robopomelo ${name}${argumentsByCommand[name] ? ' ' + argumentsByCommand[name] : ''}`,
    flags: [...new Set([...globalFlags, ...(commandFlags[name] ?? [])])].map((name) => ({
      name,
      type: flagDefinitions[name]!.type,
      multiple: flagDefinitions[name]!.multiple === true,
    })),
    examples: examples[name] ?? [
      `robopomelo ${name}${argumentsByCommand[name] ? ' ' + argumentsByCommand[name] : ''} --help`,
    ],
  };
}
export function helpText(name?: CommandName): string {
  const notes =
    'JSON file inputs accept - for bounded stdin. JSON and non-TTY commands never prompt.\n--authorize supplies explicit scopes. --yes never supplies authority or reviewer consent.\n--offline is per invocation. update configure --online explicitly clears stored offline policy.\nupdate configure --resume clears a rollback hold while preserving later policy edits.\n';
  if (!name)
    return `RoboPomelo\n\n${commandRegistry.map((c) => `${c.name.padEnd(22)} ${c.description}`).join('\n')}\n\nUse robopomelo <command> --help for exact inputs.\n${notes}`;
  const help = commandHelp(name);
  return `RoboPomelo: ${help.description}\n\nUsage: ${help.usage}\n\nOptions:\n${help.flags.map((f) => `  --${f.name}${f.type === 'string' ? ' <value>' : ''}${f.multiple ? ' (repeatable)' : ''}`).join('\n')}\n\nExamples:\n${help.examples.map((e) => '  ' + e).join('\n')}\n\n${notes}`;
}
