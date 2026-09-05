import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ParsedCommand } from '../arguments.js';
import type { CommandContext } from '../commands/types.js';
import { requiredText, WizardEnd, type TerminalAdapter } from './terminal.js';
export async function selectProject(
  command: ParsedCommand,
  context: CommandContext,
  terminal: TerminalAdapter,
): Promise<void> {
  const given =
    command.positionals[0] ?? (typeof command.flags.project === 'string' ? command.flags.project : undefined);
  let path = given
    ? resolve(context.cwd ?? process.cwd(), given)
    : context.project.current?.root.identity().canonicalPath;
  if (!path) {
    const action = await terminal.choose('Choose a project', [
      { value: 'open', label: 'Open existing project' },
      { value: 'create', label: 'Create blank project' },
      { value: 'example', label: 'Create fictional inbound-pallet example' },
      { value: 'exit', label: 'Exit' },
    ]);
    if (action === 'exit') throw new WizardEnd();
    path = resolve(context.cwd ?? process.cwd(), await requiredText(terminal, 'Project folder'));
    if (action !== 'open') {
      await create(path, action === 'example');
      return;
    }
  }
  try {
    await stat(resolve(path, 'deployment.yaml'));
    await context.project.open(path, command.scopes);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    const action = await terminal.choose('This folder has no source. Create a blank project here?', [
      { value: 'create', label: 'Create' },
      { value: 'exit', label: 'Exit' },
    ]);
    if (action === 'exit') throw new WizardEnd();
    await create(path, false);
  }
  async function create(folder: string, example: boolean) {
    const authorized =
      command.scopes.includes('author') ||
      (await terminal.choose(`Authorize creating a new project at ${folder}?`, [
        { value: 'authorize', label: 'Authorize author for this folder' },
        { value: 'exit', label: 'Exit' },
      ])) === 'authorize';
    if (!authorized) throw new WizardEnd();
    const name = await requiredText(terminal, 'Project name');
    await context.project.create(folder, name, example, [...new Set([...command.scopes, 'author' as const])]);
  }
}
