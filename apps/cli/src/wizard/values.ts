import type { Criterion, Quantity } from '@robopomelo/spec';
import { units } from '@robopomelo/spec';
import { decimalToFraction } from '@robopomelo/core';
import { back, requiredText, WizardBack, type TerminalAdapter } from './terminal.js';
export async function editQuantity(terminal: TerminalAdapter, previous?: Quantity): Promise<Quantity> {
  let value: string;
  for (;;) {
    value = await terminal.text('Exact decimal value', previous?.value);
    try {
      decimalToFraction(value);
      break;
    } catch {
      terminal.write('Use a bounded plain decimal, such as 0 or 12.5. No conversion is inferred.\n');
    }
  }
  const chosen = await terminal.choose('Unit', [
    ...units.map((u) => ({ value: u.id, label: u.id })),
    { value: 'custom', label: 'Custom unsupported unit' },
    back,
  ]);
  if (chosen === 'back') throw new WizardBack();
  const unit =
    chosen === 'custom' ? await requiredText(terminal, 'Explicit unit identifier', previous?.unit) : chosen;
  return { value, unit, subject: await requiredText(terminal, 'Measured subject', previous?.subject) };
}
export async function editBoolean(terminal: TerminalAdapter): Promise<boolean> {
  const choice = await terminal.choose('Boolean value', [
    { value: 'true', label: 'True' },
    { value: 'false', label: 'False' },
    back,
  ]);
  if (choice === 'back') throw new WizardBack();
  return choice === 'true';
}
export async function editStringList(
  terminal: TerminalAdapter,
  label: string,
  previous: string[] = [],
): Promise<string[]> {
  const value = await terminal.multiline(
    `${label}. One item per line.`,
    previous.length ? previous.join('\n') : undefined,
  );
  return value === '' ? [] : value.split('\n');
}
export async function editCriterion(terminal: TerminalAdapter, previous?: Criterion): Promise<Criterion> {
  const kind = await terminal.choose('Pass criterion kind', [
    { value: 'numeric', label: 'Numeric' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'categorical', label: 'Categorical' },
    back,
  ]);
  if (kind === 'back') throw new WizardBack();
  if (kind === 'boolean') return { kind, expected: await editBoolean(terminal) };
  if (kind === 'categorical')
    return {
      kind,
      expected: await editStringList(
        terminal,
        'Expected outcomes',
        previous?.kind === 'categorical' ? previous.expected : [],
      ),
    };
  const operator = await terminal.choose('Numeric operator', [
    { value: 'gte', label: 'gte' },
    { value: 'lte', label: 'lte' },
    { value: 'eq', label: 'eq' },
    { value: 'between', label: 'between' },
    back,
  ]);
  if (operator === 'back') throw new WizardBack();
  const threshold = await editQuantity(
    terminal,
    previous?.kind === 'numeric' ? previous.threshold : undefined,
  );
  return {
    kind: 'numeric',
    operator: operator as 'gte' | 'lte' | 'eq' | 'between',
    threshold,
    ...(operator === 'between'
      ? { upper: await editQuantity(terminal, previous?.kind === 'numeric' ? previous.upper : undefined) }
      : {}),
  };
}
