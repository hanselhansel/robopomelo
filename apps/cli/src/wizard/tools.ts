import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { checkSchema, type ReviewCommand, type Evidence } from '@robopomelo/spec';
import { generateArtifacts } from '@robopomelo/artifacts';
import { sha256, DomainError } from '@robopomelo/core';
import { EvidenceService } from '../../../../packages/project-fs/src/evidence/service.js';
import { FileSelection } from '../../../../packages/project-fs/src/evidence/selection.js';
import { ExportService } from '../../../../packages/project-fs/src/export/service.js';
import { readInput } from '../input.js';
import type { CommitResult } from '../../../../packages/project-fs/src/contracts.js';
import { back, requiredText, WizardBack } from './terminal.js';
import { editActor } from './actor.js';
import { referenceChoices, referenceMany } from './references.js';
import { ensureScope, intent, saveDraft, findings } from './save.js';
import type { WizardState } from './state.js';
function recordResult(state: WizardState, result: CommitResult): void {
  state.terminal.write(JSON.stringify(result, null, 2) + '\n');
  if (result.kind === 'committed') {
    state.draft.adopt(result.snapshot);
    state.saved++;
    state.intent = null;
  } else if (result.kind === 'proposal') {
    state.proposed++;
    (state.toolProposals ??= []).push(result.proposalId);
    state.terminal.write(`Proposal ${result.proposalId} is stored; committed source is unchanged.\n`);
  }
}
async function cleanDraft(state: WizardState): Promise<boolean> {
  if (!state.draft.dirty() && !state.draft.proposal && !state.toolProposals?.length) return true;
  const choice = await state.terminal.choose('This tool uses committed source. Resolve pending work first.', [
    { value: 'save', label: 'Save pending changes' },
    { value: 'discard', label: 'Explicitly reload current source (stored proposals remain)' },
    back,
  ]);
  if (choice === 'save') {
    await saveDraft(state);
    return !state.draft.dirty() && !state.draft.proposal && !state.toolProposals?.length;
  }
  if (choice === 'discard') {
    state.draft.adopt(await state.context.project.snapshot());
    state.intent = null;
    state.toolProposals = [];
    return true;
  }
  return false;
}
async function exportPackage(state: WizardState, candidate = false): Promise<void> {
  if (!candidate && !(await cleanDraft(state))) return;
  if (!(await ensureScope(state.context, state.terminal, 'export'))) return;
  const snapshot = await state.context.project.snapshot(),
    selected = state.context.project.current!,
    source = (await selected.root.readFile('deployment.yaml')).toString('utf8');
  let ids: string[] = [];
  if (!candidate) {
    const mode = await state.terminal.choose('Evidence in this export', [
      { value: 'none', label: 'No attachments' },
      { value: 'all', label: 'All declared attachments' },
      { value: 'select', label: 'Select attachments' },
      back,
    ]);
    if (mode === 'back') return;
    const choices = snapshot.deployment.evidence
      .filter((e) => e.location.kind === 'attachment')
      .map((e) => ({ value: e.id, label: `${e.title} [${e.id}]` }));
    ids =
      mode === 'all'
        ? choices.map((c) => c.value)
        : mode === 'select'
          ? await referenceMany(state.terminal, choices)
          : [];
  }
  const plan = generateArtifacts({ source, snapshot, selectedEvidenceIds: ids });
  if (candidate) {
    const patch = await intent(state),
      bytes = Buffer.from(JSON.stringify(patch, null, 2) + '\n');
    plan.members.push({ path: 'candidate-patch.json', mediaType: 'application/json', bytes });
    const member = plan.members.find((m) => m.path === 'manifest.json')!,
      manifest = JSON.parse(Buffer.from(member.bytes).toString('utf8'));
    manifest.members.push({
      path: 'candidate-patch.json',
      mediaType: 'application/json',
      size: bytes.length,
      sha256: sha256(bytes),
    });
    member.bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  }
  const format = await state.terminal.choose('Export format', [
    { value: 'files', label: 'Files' },
    { value: 'zip', label: 'ZIP' },
    back,
  ]);
  if (format === 'back') return;
  const name = await state.terminal.text('Output name under exports/ (optional)');
  const exporter = new ExportService(state.context.project.requireSession(selected)),
    authorization = state.context.project.authorization(selected),
    preview = await exporter.preview(
      plan,
      { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash },
      authorization,
    ),
    result = await exporter.persist(preview.previewId, {
      format: format as 'files' | 'zip',
      authorization,
      ...(name ? { name } : {}),
    });
  state.terminal.write(
    `Exported ${result.path} from revision ${result.sourceRevision}.${candidate ? ' candidate-patch.json retains its original base and is not applied.' : ''}\n`,
  );
}
async function suppliedReview(state: WizardState): Promise<void> {
  if (!(await cleanDraft(state)) || !(await ensureScope(state.context, state.terminal, 'record-decisions')))
    return;
  const path = resolve(
    state.context.cwd ?? process.cwd(),
    await requiredText(state.terminal, 'Complete supplied ReviewCommand JSON file'),
  );
  const input = await readInput(path, Readable.from([]));
  if (checkSchema(input, 'review').length)
    throw new DomainError(
      'INVALID_INPUT',
      'Supply a complete ReviewCommand. No reviewer, decision date or provenance is inferred.',
    );
  state.terminal.write(JSON.stringify(input, null, 2) + '\n');
  if (
    (await state.terminal.choose('Record this exact supplied decision?', [
      { value: 'record', label: 'Record supplied decision' },
      back,
    ])) !== 'record'
  )
    return;
  const result = await state.context.project.review(input as ReviewCommand);
  recordResult(state, result);
}
async function copyEvidence(state: WizardState): Promise<void> {
  if (
    !(await cleanDraft(state)) ||
    !(await ensureScope(state.context, state.terminal, 'author')) ||
    !(await ensureScope(state.context, state.terminal, 'evidence'))
  )
    return;
  state.actor ??= await editActor(state.terminal);
  const path = resolve(
      state.context.cwd ?? process.cwd(),
      await requiredText(state.terminal, 'Explicit evidence file path'),
    ),
    title = await requiredText(state.terminal, 'Evidence title'),
    purpose = await state.terminal.choose('Evidence purpose', [
      { value: 'planning', label: 'Planning' },
      { value: 'acceptance-requirement', label: 'Acceptance requirement' },
      { value: 'decision', label: 'Decision' },
    ]),
    provenance = await requiredText(state.terminal, 'Supplied evidence provenance');
  const snapshot = await state.context.project.snapshot(),
    relatedIds = await referenceMany(
      state.terminal,
      referenceChoices(snapshot.deployment, 'relatedIds', '/evidence/new/relatedIds'),
    );
  const selected = state.context.project.current!,
    selection = await FileSelection.open(path);
  try {
    const service = new EvidenceService(state.context.project.requireSession(selected)),
      result = await service.addFile(selection, {
        expected: { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash },
        mutationId: state.context.project.id(),
        authorization: state.context.project.authorization(selected),
        actor: state.actor,
        metadata: {
          title,
          purpose: purpose as Evidence['purpose'],
          provenance: { state: 'provided', value: provenance },
          relatedIds,
        },
      });
    recordResult(state, result);
  } finally {
    await selection.close();
  }
}
async function applyProposal(state: WizardState): Promise<void> {
  if (state.draft.dirty()) {
    state.terminal.write('Save or explicitly discard unsaved edits before applying a stored proposal.\n');
    return;
  }
  if (!(await ensureScope(state.context, state.terminal, 'author'))) return;
  const selected = state.context.project.current!,
    session = state.context.project.requireSession(selected),
    proposals = (await session.proposalList()).filter((p) => p.status === 'pending');
  const id = await state.terminal.choose('Stored proposals', [
    ...proposals.map((p) => ({
      value: p.proposalId,
      label: `${p.proposalId}: ${p.diff.length} changed fields`,
    })),
    back,
  ]);
  if (id === 'back') return;
  const proposal = proposals.find((p) => p.proposalId === id)!;
  state.terminal.write(JSON.stringify(proposal.diff, null, 2) + '\n');
  if (
    (await state.terminal.choose(
      `Apply exact proposal ${id} to ${proposal.request.expected.sourceRevision}?`,
      [{ value: 'apply', label: 'Apply' }, back],
    )) !== 'apply'
  )
    return;
  const result = await session.applyStoredProposal(id, {
    expected: proposal.request.expected,
    authorization: state.context.project.authorization(selected),
    approvedPatchDigest: proposal.digest,
  });
  state.terminal.write(JSON.stringify(result, null, 2) + '\n');
  if (result.kind === 'committed') {
    state.draft.adopt(result.snapshot);
    state.saved++;
    state.intent = null;
    state.toolProposals = state.toolProposals?.filter((proposalId) => proposalId !== id) ?? [];
  }
}
export async function wizardTools(state: WizardState): Promise<void> {
  for (;;) {
    const action = await state.terminal.choose('Review and handoff tools', [
      { value: 'findings', label: 'Inspect draft findings' },
      { value: 'review', label: 'Record a complete supplied review file' },
      { value: 'evidence', label: 'Copy a selected evidence file' },
      { value: 'export', label: 'Export committed review package' },
      { value: 'patch-export', label: 'Export pending candidate patch' },
      { value: 'proposal', label: 'Inspect and apply stored proposal' },
      { value: 'history', label: 'Inspect recorded history' },
      { value: 'current', label: 'Inspect current committed source' },
      { value: 'reload', label: 'Explicitly reload current source' },
      { value: 'actor', label: 'Edit mutation recorder and purpose' },
      back,
    ]);
    if (action === 'back') return;
    try {
      if (action === 'findings') findings(state);
      if (action === 'review') await suppliedReview(state);
      if (action === 'evidence') await copyEvidence(state);
      if (action === 'export') await exportPackage(state);
      if (action === 'patch-export') await exportPackage(state, true);
      if (action === 'proposal') await applyProposal(state);
      if (action === 'history')
        state.terminal.write(
          JSON.stringify(
            await state.context.project.requireSession(state.context.project.current!).historyList(),
            null,
            2,
          ) + '\n',
        );
      if (action === 'current')
        state.terminal.write(JSON.stringify(await state.context.project.read(), null, 2) + '\n');
      if (
        action === 'reload' &&
        (await state.terminal.choose(
          'Discard the working candidate and reload actual source? Stored proposals are retained.',
          [
            { value: 'keep', label: 'Keep working candidate' },
            { value: 'reload', label: 'Reload' },
          ],
        )) === 'reload'
      ) {
        state.draft.adopt(await state.context.project.snapshot());
        state.intent = null;
        state.toolProposals = [];
      }
      if (action === 'actor') {
        state.actor = await editActor(state.terminal, state.actor ?? undefined);
        state.purpose = await requiredText(
          state.terminal,
          'Purpose of authored change',
          state.purpose ?? undefined,
        );
        state.intent = null;
      }
    } catch (error) {
      if (error instanceof WizardBack) continue;
      state.terminal.write(
        `Tool failed. Saved source and pending draft remain available. ${String((error as { code?: string }).code ?? 'ERROR')}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
}
