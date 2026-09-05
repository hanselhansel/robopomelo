import type { FieldDefinition, FlowStep, FlowException } from '@robopomelo/spec';
import { editScalar } from './scalar.js';
import { recordPath, type EditorContext } from './editor-context.js';
import { back, WizardBack, type TerminalAdapter } from './terminal.js';
export async function editFlowList(
  terminal: TerminalAdapter,
  kind: 'steps',
  previous: FlowStep[],
  context: EditorContext,
): Promise<FlowStep[]>;
export async function editFlowList(
  terminal: TerminalAdapter,
  kind: 'exceptions',
  previous: FlowException[],
  context: EditorContext,
): Promise<FlowException[]>;
export async function editFlowList(
  terminal: TerminalAdapter,
  kind: 'steps' | 'exceptions',
  previous: (FlowStep | FlowException)[],
  context: EditorContext,
): Promise<(FlowStep | FlowException)[]> {
  const rows = structuredClone(previous);
  const descriptors: Pick<FieldDefinition, 'path' | 'label' | 'inputKind' | 'referenceTarget'>[] =
    kind === 'steps'
      ? [
          { path: 'title', label: 'Step name', inputKind: 'text' },
          { path: 'location', label: 'Location', inputKind: 'knowledge-text' },
          {
            path: 'handoffToId',
            label: 'Handoff responsibility',
            inputKind: 'knowledge-id',
            referenceTarget: 'stakeholders',
          },
        ]
      : [
          { path: 'trigger', label: 'Exception trigger', inputKind: 'knowledge-text' },
          { path: 'response', label: 'Response', inputKind: 'knowledge-text' },
          { path: 'ownerId', label: 'Owner', inputKind: 'knowledge-id', referenceTarget: 'stakeholders' },
          {
            path: 'testIds',
            label: 'Planned recovery tests',
            inputKind: 'reference-list',
            referenceTarget: 'acceptanceTests',
          },
        ];
  for (;;) {
    let chosen = await terminal.choose(`Ordered flow ${kind}`, [
      { value: 'done', label: 'Done' },
      { value: 'add', label: 'Add' },
      ...rows.map((r) => ({ value: r.id, label: `${'title' in r ? r.title : 'Exception'} [${r.id}]` })),
      { value: 'back', label: 'Cancel this field edit' },
    ]);
    if (chosen === 'done') return rows;
    if (chosen === 'back') throw new WizardBack();
    if (chosen === 'add') {
      const id = context.id();
      rows.push(
        kind === 'steps'
          ? { id, title: '', location: null, handoffToId: null }
          : { id, trigger: null, response: null, ownerId: null, testIds: [] },
      );
      chosen = id;
    }
    const row = rows.find((r) => r.id === chosen)!;
    for (;;) {
      const field = await terminal.choose(`${kind} item [${row.id}]`, [
        ...descriptors.map((d) => ({ value: d.path, label: d.label })),
        { value: 'up', label: 'Move up' },
        { value: 'down', label: 'Move down' },
        { value: 'remove', label: 'Remove' },
        back,
      ]);
      if (field === 'back') break;
      if (field === 'remove') {
        if (
          (await terminal.choose('Remove this item from the pending draft?', [
            { value: 'keep', label: 'Keep' },
            { value: 'remove', label: 'Remove' },
          ])) === 'remove'
        ) {
          rows.splice(rows.indexOf(row), 1);
          break;
        }
        continue;
      }
      if (field === 'up' || field === 'down') {
        const from = rows.indexOf(row),
          to = from + (field === 'up' ? -1 : 1);
        if (to >= 0 && to < rows.length) {
          rows.splice(from, 1);
          rows.splice(to, 0, row);
        }
        continue;
      }
      const descriptor = descriptors.find((d) => d.path === field)!;
      try {
        const record = row as unknown as Record<string, unknown>;
        record[field] = await editScalar(
          terminal,
          {
            ...descriptor,
            id: `flow.${field}`,
            collection: context.collection,
            step: 'flow',
            help: 'Record the supplied flow detail or an explicit knowledge state.',
          },
          record[field],
          { ...context, path: `${recordPath(context)}/${kind}/${row.id}` },
        );
      } catch (error) {
        if (!(error instanceof WizardBack)) throw error;
      }
    }
  }
}
