import type { Knowledge } from '@robopomelo/spec';
import { hasValue } from '@robopomelo/core';
import { back, requiredText, WizardBack, type TerminalAdapter } from './terminal.js';
export interface KnowledgeDetails {
  owner: () => Promise<string | undefined>;
  evidence: () => Promise<string[]>;
}
export async function editKnowledge<T>(
  terminal: TerminalAdapter,
  previous: Knowledge<T>,
  valueEditor: (previous?: T) => Promise<T>,
  details: KnowledgeDetails,
): Promise<Knowledge<T>> {
  const state = await terminal.choose('Knowledge state', [
    { value: 'missing', label: 'Missing' },
    { value: 'unknown', label: 'Unknown' },
    { value: 'unverified', label: 'Unverified' },
    { value: 'provided', label: 'Provided' },
    { value: 'not-applicable', label: 'Not applicable' },
    back,
  ]);
  if (state === 'back') throw new WizardBack();
  if (state === 'missing') return null;
  if (state === 'not-applicable')
    return {
      state,
      reason: await requiredText(
        terminal,
        'Why is this not applicable?',
        previous?.state === 'not-applicable' ? previous.reason : undefined,
      ),
    };
  if (state === 'unknown') {
    const note = await requiredText(
        terminal,
        'What is unknown?',
        previous?.state === 'unknown' ? previous.note : undefined,
      ),
      ownerId = await details.owner(),
      nextAction = await terminal.text(
        'Next action (optional)',
        previous?.state === 'unknown' ? previous.nextAction : undefined,
      );
    return { state, note, ...(ownerId ? { ownerId } : {}), ...(nextAction ? { nextAction } : {}) };
  }
  const value = await valueEditor(hasValue(previous) ? previous.value : undefined);
  const result: Extract<NonNullable<Knowledge<T>>, { state: 'provided' | 'unverified' }> = {
    state: state as 'provided' | 'unverified',
    value,
    ...(hasValue(previous) && previous.note !== undefined ? { note: previous.note } : {}),
    ...(hasValue(previous) && previous.sourceEvidenceIds !== undefined
      ? { sourceEvidenceIds: [...previous.sourceEvidenceIds] }
      : {}),
  };
  const action = await terminal.choose('Value details', [
    { value: 'done', label: 'Done' },
    { value: 'details', label: 'Details' },
    { value: 'clear', label: 'Clear notes and evidence' },
    back,
  ]);
  if (action === 'back') throw new WizardBack();
  if (action === 'clear') {
    delete result.note;
    delete result.sourceEvidenceIds;
  }
  if (action === 'details') {
    const note = await terminal.text('Note (optional)', result.note);
    if (note) result.note = note;
    else delete result.note;
    result.sourceEvidenceIds = await details.evidence();
    await terminal.choose('Details recorded', [{ value: 'done', label: 'Done' }]);
  }
  return result;
}
