import { fields, type Collection, type Deployment } from '@robopomelo/spec';
export const collections: readonly Collection[] = [
  'stakeholders',
  'needs',
  'problems',
  'workflows',
  'challenges',
  'risks',
  'assumptions',
  'kpis',
  'requirements',
  'acceptanceTests',
  'evidence',
  'decisions',
  'challengeAnswers',
];
/** Missing-data scaffolding. Enum distinctions with engineering meaning are chosen by the create dialog. */
export function newRecord<C extends Collection>(
  collection: C,
  id: string,
  title: string,
  choices: Record<string, string> = {},
): Deployment[C][number] {
  const record: Record<string, unknown> = {
    id,
    title,
    description: null,
    ownerId: null,
    sourceEvidenceIds: [],
    extensions: {},
  };
  for (const field of fields.filter((f) => f.collection === collection)) {
    if (Object.hasOwn(record, field.path)) continue;
    if (field.inputKind.startsWith('knowledge-')) record[field.path] = null;
    else if (
      ['string-list', 'reference-list', 'flow-steps', 'flow-exceptions', 'verification'].includes(
        field.inputKind,
      )
    )
      record[field.path] = [];
    else if (field.inputKind === 'boolean') record[field.path] = false;
    else if (field.inputKind === 'enum')
      record[field.path] = choices[field.path] ?? field.options?.[0]?.value;
    else record[field.path] = '';
  }
  if (collection === 'evidence') record.location = { kind: 'future', description: '' };
  if (collection === 'decisions') {
    record.actor = null;
    record.decidedAt = null;
  }
  if (collection === 'challengeAnswers') {
    record.promptId = choices.promptId ?? '';
    record.promptVersion = choices.promptVersion ?? '';
  }
  return record as unknown as Deployment[C][number];
}
