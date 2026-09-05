import { fields, workflows, type Collection } from '@robopomelo/spec';
import { DomainError } from '@robopomelo/core';
import type { CommandHandler } from '../commands/types.js';
import { NodeTerminal, WizardBack, WizardEnd, back } from './terminal.js';
import { WizardDraft } from './draft.js';
import { collections } from './record-defaults.js';
import { editRecord, editCollection } from './records.js';
import { editQuestions } from './questions.js';
import { selectProject } from './root.js';
import { findings, saveDraft } from './save.js';
import { wizardTools } from './tools.js';
import type { WizardState } from './state.js';
export const runWizard: CommandHandler = async (command, context) => {
  if (!context.isTTY || command.flags.json)
    throw new DomainError(
      'INVALID_ARGUMENTS',
      'plan requires a TTY and does not accept --json. Use the composable commands for scripted operation.',
    );
  const terminal = new NodeTerminal({
    stdin: context.stdin,
    stdout: context.stdout ?? process.stdout,
    isTTY: context.isTTY,
  });
  let state: WizardState | undefined,
    status: 'exited' | 'cancelled' = 'exited',
    step = 0;
  try {
    terminal.write(
      'RoboPomelo terminal planner. Facts remain missing, unknown or unverified until you supply them. No acceptance tests are executed.\n',
    );
    await selectProject(command, context, terminal);
    if (!context.project.status().scopes?.includes('author')) {
      const choice = await terminal.choose(`Author permission for ${context.project.status().root}`, [
        { value: 'authorize', label: 'Authorize author for this run' },
        { value: 'inspect', label: 'Inspect without granting' },
        { value: 'exit', label: 'Exit' },
      ]);
      if (choice === 'exit') throw new WizardEnd();
      if (choice === 'authorize')
        await context.project.grant(
          ['inspect', 'author'],
          context.project.status().mode ?? 'autonomous',
          false,
        );
    }
    state = {
      context,
      terminal,
      draft: new WizardDraft(await context.project.snapshot()),
      actor: null,
      purpose: null,
      intent: null,
      saved: 0,
      proposed: 0,
    };
    for (;;) {
      const workflow = workflows[step]!,
        visible = [
          ...new Set(workflow.fields.map((f) => f.collection).filter((c) => c !== 'project')),
        ] as Collection[];
      terminal.write(
        `\nStep ${step + 1}/5: ${workflow.title}\n${workflow.description}\nCommitted source: ${state.draft.base.validation.label}. ${state.draft.dirty() ? 'Pending edits.' : state.draft.proposal ? 'Stored proposal; source unchanged.' : 'No unsaved edits.'}\n`,
      );
      const action = await terminal.choose('Choose an action', [
        ...(step === 0 ? [{ value: 'project', label: 'Edit project framing' }] : []),
        ...visible.map((c) => ({ value: c, label: `Records: ${c} (${state!.draft.value[c].length})` })),
        { value: 'questions', label: 'Answer engineering prompts' },
        { value: 'other', label: 'Other record types' },
        { value: 'findings', label: 'Inspect findings' },
        { value: 'save', label: 'Save' },
        { value: 'tools', label: 'Review, evidence and export tools' },
        { value: 'next', label: step < 4 ? 'Next' : 'Finish and review' },
        ...(step ? [{ value: 'back', label: 'Previous step' }] : []),
        { value: 'exit', label: 'Exit' },
      ]);
      const editor = {
        deployment: state.draft.value,
        id: context.project.id,
        ...(context.cwd ? { cwd: context.cwd } : {}),
      };
      try {
        if (action === 'project')
          await editRecord(terminal, {
            ...editor,
            collection: 'project',
            recordId: state.draft.value.project.id,
          });
        else if (collections.includes(action as Collection))
          await editCollection(terminal, action as Collection, editor);
        else if (action === 'questions') await editQuestions(terminal, workflow.id, editor);
        else if (action === 'other') {
          const collection = await terminal.choose('All record types', [
            ...collections.map((c) => ({ value: c, label: c })),
            back,
          ]);
          if (collection !== 'back') await editCollection(terminal, collection as Collection, editor);
        } else if (action === 'findings') findings(state);
        else if (action === 'save') await saveDraft(state);
        else if (action === 'tools') await wizardTools(state);
        else if (action === 'next') {
          if (step < 4) step++;
          else await wizardTools(state);
        } else if (action === 'back') step--;
        else if (action === 'exit') {
          if (state.draft.dirty()) {
            const decision = await terminal.choose('Pending edits are only in memory.', [
              { value: 'save', label: 'Save' },
              { value: 'discard', label: 'Discard pending changes' },
              { value: 'continue', label: 'Continue editing' },
            ]);
            if (decision === 'continue') continue;
            if (decision === 'save' && !(await saveDraft(state))) continue;
            if (decision === 'discard') state.draft.discardPending();
          }
          break;
        }
      } catch (error) {
        if (error instanceof WizardEnd) throw error;
        if (error instanceof WizardBack) continue;
        terminal.write(
          `Edit retained where complete; saved source was not replaced by this error. ${String((error as { code?: string }).code ?? 'ERROR')}: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    }
  } catch (error) {
    if (!(error instanceof WizardEnd)) throw error;
    status = 'cancelled';
    terminal.write(
      'Wizard closed. Pending edits were not saved automatically; previously saved revisions and proposals remain.\n',
    );
  } finally {
    terminal.close();
  }
  const snapshot = context.project.current ? await context.project.snapshot() : undefined;
  return {
    data: {
      status,
      saved: (state?.saved ?? 0) > 0,
      proposed: !!state?.draft.proposal || !!state?.toolProposals?.length,
      pending: state?.draft.dirty() ?? false,
      proposalId: state?.draft.proposal?.id ?? state?.toolProposals?.at(-1) ?? null,
      readiness: snapshot?.validation.readiness ?? null,
      approvalStatus: snapshot?.approvalStatus ?? null,
    },
    ...(snapshot ? { snapshot } : {}),
  };
};
