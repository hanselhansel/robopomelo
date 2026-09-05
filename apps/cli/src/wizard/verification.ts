import { VERIFICATION_CLAIM_PATHS, type Collection, type VerificationDeclaration } from '@robopomelo/spec';
import { editBoolean } from './values.js';
import { editActor } from './actor.js';
import { textValue } from './scalar.js';
import { referenceChoices, referenceMany } from './references.js';
import { recordPath, type EditorContext } from './editor-context.js';
import { back, requiredText, WizardBack, type TerminalAdapter } from './terminal.js';
export async function editVerification(
  terminal: TerminalAdapter,
  previous: VerificationDeclaration[],
  context: EditorContext,
): Promise<VerificationDeclaration[]> {
  const rows = structuredClone(previous),
    paths = VERIFICATION_CLAIM_PATHS[context.collection as Collection];
  for (;;) {
    let chosen = await terminal.choose('Declared verification support', [
      { value: 'done', label: 'Done' },
      { value: 'add', label: 'Add' },
      ...rows.map((r) => ({ value: r.id, label: `${r.claimPath} [${r.id}]` })),
      { value: 'back', label: 'Cancel this field edit' },
    ]);
    if (chosen === 'done') return rows;
    if (chosen === 'back') throw new WizardBack();
    if (chosen === 'add') {
      const claimPath = await terminal.choose('Claim field', [
        ...paths.map((path) => ({ value: path, label: path })),
        back,
      ]);
      if (claimPath === 'back') continue;
      const id = context.id();
      rows.push({ id, claimPath, required: false, evidenceIds: [], attestation: null });
      chosen = id;
    }
    const row = rows.find((r) => r.id === chosen)!;
    for (;;) {
      const action = await terminal.choose(`Verification [${row.id}]`, [
        { value: 'claimPath', label: 'Claim field' },
        { value: 'required', label: 'Required support obligation' },
        { value: 'evidenceIds', label: 'Planning support evidence' },
        { value: 'attestation', label: 'Supplied attestation' },
        { value: 'remove', label: 'Remove declaration' },
        back,
      ]);
      if (action === 'back') break;
      try {
        if (action === 'claimPath') {
          const path = await terminal.choose('Claim field', [
            ...paths.map((path) => ({ value: path, label: path })),
            back,
          ]);
          if (path !== 'back') row.claimPath = path;
        }
        if (action === 'required') {
          terminal.write('Changing an obligation requires decision-recording scope at Save.\n');
          row.required = await editBoolean(terminal);
        }
        if (action === 'evidenceIds')
          row.evidenceIds = await referenceMany(
            terminal,
            referenceChoices(
              context.deployment,
              'evidenceIds',
              `${recordPath(context)}/verification/${row.id}/evidenceIds`,
            ),
            row.evidenceIds,
          );
        if (action === 'attestation') {
          const intent = await terminal.choose('Attributed verification statement', [
            { value: 'none', label: 'No attestation (clear)' },
            { value: 'record', label: 'Record supplied statement' },
            back,
          ]);
          if (intent === 'none') row.attestation = null;
          if (intent === 'record') {
            const actor = await editActor(terminal, row.attestation?.actor, true),
              statement = await textValue(terminal, 'Supplied statement', row.attestation?.statement),
              recordedAt = await requiredText(
                terminal,
                'Supplied date/time (ISO 8601)',
                row.attestation?.recordedAt,
              ),
              source = await requiredText(terminal, 'Supplied attestation source', row.attestation?.source);
            row.attestation = { actor, statement, recordedAt, source };
          }
        }
        if (
          action === 'remove' &&
          (await terminal.choose('Remove declaration from pending draft?', [
            { value: 'keep', label: 'Keep' },
            { value: 'remove', label: 'Remove' },
          ])) === 'remove'
        ) {
          rows.splice(rows.indexOf(row), 1);
          break;
        }
      } catch (error) {
        if (!(error instanceof WizardBack)) throw error;
      }
    }
  }
}
