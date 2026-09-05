import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import {
  checkInputLimits,
  type FieldDefinition,
  type Knowledge,
  type Quantity,
  type Criterion,
} from '@robopomelo/spec';
import { DomainError } from '@robopomelo/core';
import { readInput } from '../input.js';
import { editKnowledge } from './knowledge.js';
import { editBoolean, editCriterion, editQuantity, editStringList } from './values.js';
import { referenceChoices, referenceMany, referenceOne } from './references.js';
import { knowledgeDetails, recordPath, type EditorContext } from './editor-context.js';
import { back, WizardBack, type TerminalAdapter } from './terminal.js';
export async function textValue(
  terminal: TerminalAdapter,
  label: string,
  previous?: string,
): Promise<string> {
  const value = await terminal.text(`${label} (:multi opens multiline input)`, previous);
  return value === ':multi' ? terminal.multiline(label, previous) : value;
}
export async function editJson(
  terminal: TerminalAdapter,
  label: string,
  previous: unknown,
  context: EditorContext,
): Promise<unknown> {
  const action = await terminal.choose(label, [
    { value: 'type', label: 'Type JSON' },
    { value: 'file', label: 'Load an explicit JSON file' },
    back,
  ]);
  if (action === 'back') throw new WizardBack();
  if (action === 'file') {
    const path = await terminal.text('JSON file path');
    if (path === '-')
      throw new DomainError('INVALID_INPUT', 'The wizard owns stdin; select a JSON file path.');
    return readInput(resolve(context.cwd ?? process.cwd(), path), Readable.from([]));
  }
  let raw = JSON.stringify(previous, null, 2);
  for (;;) {
    raw = await terminal.multiline('JSON value', raw);
    try {
      const value: unknown = JSON.parse(raw);
      if (checkInputLimits(value)) throw new Error('structural limit');
      return value;
    } catch {
      terminal.write(
        'JSON is incomplete or exceeds shared limits. Correct it or use :back; saved source is unchanged.\n',
      );
    }
  }
}
export async function editScalar(
  terminal: TerminalAdapter,
  field: FieldDefinition,
  previous: unknown,
  context: EditorContext,
): Promise<unknown> {
  const path = `${recordPath(context)}/${field.path}`,
    details = knowledgeDetails(terminal, context, (previous ?? null) as Knowledge<unknown>);
  terminal.write(`${field.help}\nCurrent value: ${JSON.stringify(previous ?? null)}\n`);
  switch (field.inputKind) {
    case 'text':
      return textValue(terminal, field.label, previous as string | undefined);
    case 'multiline':
      return terminal.multiline(field.label, previous as string | undefined);
    case 'boolean':
      return editBoolean(terminal);
    case 'enum': {
      const value = await terminal.choose(field.label, [...(field.options ?? []), back]);
      if (value === 'back') throw new WizardBack();
      return value;
    }
    case 'string-list':
      return editStringList(terminal, field.label, (previous ?? []) as string[]);
    case 'reference-list':
      return referenceMany(
        terminal,
        referenceChoices(context.deployment, field.path, path, field.referenceTarget),
        (previous ?? []) as string[],
      );
    case 'knowledge-text':
      return editKnowledge<string>(
        terminal,
        (previous ?? null) as Knowledge<string>,
        (old) => textValue(terminal, 'Supplied value', old),
        details,
      );
    case 'knowledge-id':
      return editKnowledge<string>(
        terminal,
        (previous ?? null) as Knowledge<string>,
        async () => {
          const value = await referenceOne(
            terminal,
            referenceChoices(context.deployment, field.path, path, field.referenceTarget),
          );
          if (value === undefined) throw new WizardBack();
          return value;
        },
        details,
      );
    case 'knowledge-quantity':
      return editKnowledge<Quantity>(
        terminal,
        (previous ?? null) as Knowledge<Quantity>,
        (old) => editQuantity(terminal, old),
        details,
      );
    case 'knowledge-criterion':
      return editKnowledge<Criterion>(
        terminal,
        (previous ?? null) as Knowledge<Criterion>,
        (old) => editCriterion(terminal, old),
        details,
      );
    default:
      throw new DomainError('INVALID_EDITOR', 'This field requires its structured editor.');
  }
}
