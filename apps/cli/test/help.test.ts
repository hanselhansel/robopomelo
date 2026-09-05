import { expect, it } from 'vitest';
import { commandRegistry, commandFlags, globalFlags, flagDefinitions } from '../src/arguments.js';
import { commandHelp, helpText } from '../src/help.js';
it('derives every leaf and allowed flag from the actual parser registry', () => {
  for (const command of commandRegistry) {
    const help = commandHelp(command.name);
    expect(help.description).toBe(command.description);
    expect(help.examples.length).toBeGreaterThan(0);
    expect(help.flags.map((f) => f.name).sort()).toEqual(
      [...new Set([...globalFlags, ...(commandFlags[command.name] ?? [])])].sort(),
    );
    for (const flag of help.flags) expect(flag.type).toBe(flagDefinitions[flag.name]!.type);
  }
});
it('provides plain help and documents stdin, scopes and update hold transitions', () => {
  expect(helpText()).toContain('RoboPomelo');
  for (const command of commandRegistry) expect(helpText()).toContain(command.name);
  expect(helpText('patch apply')).toContain('stdin');
  expect(helpText('trust grant')).toContain('--authorize');
  expect(helpText('update configure')).toContain('--resume');
  expect(helpText()).not.toMatch(/\u001b\[/);
});
