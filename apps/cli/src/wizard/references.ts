import type { Collection, Deployment } from '@robopomelo/spec';
import { buildReferenceIndex, isReferenceTarget } from '@robopomelo/core';
import { back, WizardBack, type Choice, type TerminalAdapter } from './terminal.js';
export function referenceChoices(
  deployment: Deployment,
  key: string,
  path: string,
  targets?: Collection | Collection[],
): Choice[] {
  const index = buildReferenceIndex(deployment),
    kinds = targets === undefined ? null : Array.isArray(targets) ? targets : [targets];
  return [...index.values()]
    .filter(
      (entry) =>
        (!kinds || kinds.includes(entry.collection as Collection)) &&
        isReferenceTarget(index, entry.id, key, path),
    )
    .map((entry) => ({ value: entry.id, label: `${String(entry.record.title ?? entry.id)} [${entry.id}]` }));
}
export async function referenceOne(
  terminal: TerminalAdapter,
  choices: Choice[],
  optional = false,
): Promise<string | undefined> {
  if (!choices.length)
    terminal.write(
      'No matching records exist yet. Return and add the related record before choosing its ID.\n',
    );
  const value = await terminal.choose('Select a stable reference', [
    ...(optional ? [{ value: 'none', label: 'None' }] : []),
    ...choices,
    back,
  ]);
  if (value === 'back') throw new WizardBack();
  return value === 'none' ? undefined : value;
}
export async function referenceMany(
  terminal: TerminalAdapter,
  choices: Choice[],
  previous: string[] = [],
): Promise<string[]> {
  let selected = [...previous];
  for (;;) {
    const missing = selected.filter((id) => !choices.some((c) => c.value === id));
    const option = await terminal.choose('Toggle references; choose Done to keep the selected IDs', [
      { value: 'done', label: 'Done' },
      { value: 'clear', label: 'Clear selection' },
      ...choices.map((c) => ({
        value: c.value,
        label: `${selected.includes(c.value) ? '[x]' : '[ ]'} ${c.label}`,
      })),
      ...missing.map((id) => ({ value: id, label: `[x] Missing record [${id}] (remove)` })),
      back,
    ]);
    if (option === 'back') throw new WizardBack();
    if (option === 'done') return selected;
    if (option === 'clear') selected = [];
    else
      selected = selected.includes(option) ? selected.filter((id) => id !== option) : [...selected, option];
  }
}
