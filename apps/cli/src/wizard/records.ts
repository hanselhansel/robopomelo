import {
  fields,
  questions,
  type Collection,
  type RecordBase,
  type Decision,
  type Evidence,
} from '@robopomelo/spec';
import { editField } from './fields.js';
import { editJson } from './scalar.js';
import { editActor } from './actor.js';
import { newRecord } from './record-defaults.js';
import type { EditorContext } from './editor-context.js';
import { back, requiredText, WizardBack, type TerminalAdapter } from './terminal.js';
async function advanced(
  terminal: TerminalAdapter,
  record: RecordBase,
  context: EditorContext,
): Promise<void> {
  const additional =
    context.collection === 'decisions'
      ? [
          { value: 'actor', label: 'Supplied decision actor' },
          { value: 'decidedAt', label: 'Supplied decision date' },
        ]
      : context.collection === 'evidence'
        ? [{ value: 'location', label: 'Evidence location' }]
        : context.collection === 'challengeAnswers'
          ? [{ value: 'prompt', label: 'Prompt identity and version' }]
          : [];
  const choice = await terminal.choose('Advanced record fields', [
    { value: 'extensions', label: 'Namespaced extensions JSON' },
    ...additional,
    back,
  ]);
  if (choice === 'extensions')
    record.extensions = (await editJson(
      terminal,
      'Extensions',
      record.extensions,
      context,
    )) as RecordBase['extensions'];
  if (choice === 'actor') {
    const action = await terminal.choose('Decision actor', [
      { value: 'record', label: 'Record supplied actor' },
      { value: 'clear', label: 'Clear' },
      back,
    ]);
    if (action === 'clear') (record as Decision).actor = null;
    else if (action === 'record')
      (record as Decision).actor = await editActor(terminal, (record as Decision).actor ?? undefined, true);
  }
  if (choice === 'decidedAt') {
    const date = await terminal.text(
      'Supplied ISO 8601 decision date; :empty clears',
      (record as Decision).decidedAt ?? undefined,
    );
    (record as Decision).decidedAt = date || null;
  }
  if (choice === 'location') {
    const evidence = record as Evidence;
    terminal.write(
      `Current: ${JSON.stringify(evidence.location)}\nAttachment paths and hashes come from the copied-evidence tool. They are never invented here.\n`,
    );
    const kind = await terminal.choose('Evidence declaration', [
      { value: 'keep', label: 'Keep current location' },
      { value: 'future', label: 'Future evidence requirement' },
      { value: 'external', label: 'External reference' },
      back,
    ]);
    if (kind === 'future')
      evidence.location = {
        kind,
        description: await requiredText(
          terminal,
          'Describe the future evidence',
          evidence.location.kind === 'future' ? evidence.location.description : undefined,
        ),
      };
    if (kind === 'external')
      evidence.location = {
        kind,
        uri: await requiredText(
          terminal,
          'Supplied external URI',
          evidence.location.kind === 'external' ? evidence.location.uri : undefined,
        ),
      };
  }
  if (choice === 'prompt') {
    const row = record as unknown as { promptId: string; promptVersion: string };
    const id = await terminal.choose('Curated prompt', [
      ...questions.map((q) => ({ value: q.id, label: q.prompt })),
      { value: 'manual', label: 'Explicit historical prompt ID/version' },
      back,
    ]);
    if (id === 'manual') {
      row.promptId = await requiredText(terminal, 'Supplied prompt ID', row.promptId);
      row.promptVersion = await requiredText(terminal, 'Supplied prompt version', row.promptVersion);
    } else if (id !== 'back') {
      row.promptId = id;
      row.promptVersion = questions.find((q) => q.id === id)!.version;
    }
  }
}
export async function editRecord(terminal: TerminalAdapter, context: EditorContext): Promise<void> {
  const record =
    context.collection === 'project'
      ? context.deployment.project
      : context.deployment[context.collection].find((r) => r.id === context.recordId)!;
  const definitions = fields.filter((f) => f.collection === context.collection);
  for (;;) {
    const chosen = await terminal.choose(`${context.collection} [${context.recordId}]`, [
      ...definitions.map((f) => ({ value: f.path, label: f.label })),
      ...(context.collection === 'project'
        ? []
        : [
            { value: 'advanced', label: 'Advanced fields' },
            { value: 'remove', label: 'Remove record' },
          ]),
      back,
    ]);
    if (chosen === 'back') return;
    try {
      if (chosen === 'advanced') {
        await advanced(terminal, record as RecordBase, context);
        continue;
      }
      if (chosen === 'remove') {
        if (
          (await terminal.choose('Remove only this record from the pending draft?', [
            { value: 'keep', label: 'Keep' },
            { value: 'remove', label: 'Remove' },
          ])) === 'remove'
        ) {
          const rows = context.deployment[context.collection as Collection] as RecordBase[];
          rows.splice(
            rows.findIndex((r) => r.id === context.recordId),
            1,
          );
          return;
        }
        continue;
      }
      const field = definitions.find((f) => f.path === chosen)!;
      const value = await editField(
        terminal,
        field,
        (record as unknown as Record<string, unknown>)[chosen],
        context,
      );
      Object.defineProperty(record, chosen, { value, writable: true, enumerable: true, configurable: true });
    } catch (error) {
      if (error instanceof WizardBack) terminal.write('Field edit cancelled; other pending edits remain.\n');
      else throw error;
    }
  }
}
export async function editCollection(
  terminal: TerminalAdapter,
  collection: Collection,
  context: Omit<EditorContext, 'collection' | 'recordId'>,
): Promise<void> {
  for (;;) {
    const rows = context.deployment[collection] as RecordBase[];
    let id = await terminal.choose(`${collection} records`, [
      { value: 'add', label: 'Add' },
      ...rows.map((r) => ({ value: r.id, label: `${r.title} [${r.id}]` })),
      back,
    ]);
    if (id === 'back') return;
    if (id === 'add') {
      const title = await terminal.text('Record name'),
        choices: Record<string, string> = {};
      if (collection === 'workflows')
        choices.mode = await terminal.choose('Flow designation', [
          { value: 'current', label: 'Current' },
          { value: 'intended', label: 'Intended' },
        ]);
      if (collection === 'evidence')
        choices.purpose = await terminal.choose('Evidence purpose', [
          { value: 'planning', label: 'Planning' },
          { value: 'acceptance-requirement', label: 'Acceptance requirement' },
          { value: 'decision', label: 'Decision' },
        ]);
      if (collection === 'challengeAnswers') {
        const prompt = await terminal.choose('Prompt', [
          ...questions.map((q) => ({ value: q.id, label: q.prompt })),
          back,
        ]);
        if (prompt === 'back') continue;
        choices.promptId = prompt;
        choices.promptVersion = questions.find((q) => q.id === prompt)!.version;
      }
      id = context.id();
      rows.push(newRecord(collection, id, title, choices));
    }
    await editRecord(terminal, { ...context, collection, recordId: id });
  }
}
