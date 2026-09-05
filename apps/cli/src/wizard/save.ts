import { checkSchema, type Scope, type Json } from '@robopomelo/spec';
import { canonicalJson, validateDeployment } from '@robopomelo/core';
import { editActor } from './actor.js';
import { requiredText, WizardBack, type TerminalAdapter } from './terminal.js';
import type { CommandContext } from '../commands/types.js';
import type { WizardState } from './state.js';
export async function ensureScope(
  context: CommandContext,
  terminal: TerminalAdapter,
  scope: Scope,
): Promise<boolean> {
  const status = context.project.status();
  if (status.scopes?.includes(scope)) return true;
  const choice = await terminal.choose(
    `Authorize ${scope} for this selected project in this run?\n${status.root ?? 'No project selected'}`,
    [
      { value: 'authorize', label: `Authorize ${scope}` },
      { value: 'back', label: 'Back without granting' },
    ],
  );
  if (choice !== 'authorize') return false;
  await context.project.grant(
    [...new Set<Scope>([...(status.scopes ?? ['inspect']), scope])],
    status.mode ?? 'autonomous',
    false,
  );
  return true;
}
export async function intent(state: WizardState) {
  state.actor ??= await editActor(state.terminal);
  state.purpose ??= await requiredText(state.terminal, 'Purpose of this authored change');
  const key = canonicalJson({
    draft: state.draft.fingerprint(),
    actor: state.actor as unknown as Json,
    purpose: state.purpose,
  });
  if (state.intent?.key !== key)
    state.intent = { key, patch: state.draft.patch(state.actor, state.purpose, state.context.project.id()) };
  return state.intent.patch;
}
export function findings(state: WizardState): void {
  const report = validateDeployment(state.draft.value, {
    sourceRevision: state.draft.base.sourceRevision,
    sourceHash: null,
    toolVersion: state.context.toolVersion,
    evidence: state.draft.base.evidenceObservations,
  });
  state.terminal.write(`\nPending draft: ${report.label}\n`);
  for (const finding of report.findings)
    state.terminal.write(
      `${finding.ruleId} ${finding.severity}${finding.status === 'waived' ? ' (waived)' : ''}: ${finding.message}\n  ${finding.nextAction}\n`,
    );
}
export async function saveDraft(state: WizardState): Promise<boolean> {
  if (!state.draft.dirty()) {
    state.terminal.write(
      state.draft.proposal
        ? 'The latest draft is already stored as a proposal. Source is unchanged.\n'
        : 'No pending authored changes.\n',
    );
    return true;
  }
  const errors = checkSchema(state.draft.value);
  if (errors.length) {
    state.terminal.write(
      `Draft structure needs correction. Nothing was written.\n${errors.map((e) => `${e.instancePath}: ${e.message}`).join('\n')}\n`,
    );
    return false;
  }
  if (!(await ensureScope(state.context, state.terminal, 'author'))) return false;
  try {
    const patch = await intent(state);
    state.terminal.write(
      `Saving ${patch.operations.length} focused operation(s) against ${patch.baseRevision}.\n${JSON.stringify(patch.operations, null, 2)}\n`,
    );
    const result = await state.context.project.apply(patch, state.draft.proposal?.id);
    if (result.kind === 'conflict') {
      state.terminal.write(
        `Source conflict. Pending draft retained. Expected ${JSON.stringify(result.expected)}; current ${JSON.stringify(result.current)}. Inspect or export the pending patch before an explicit reload.\n`,
      );
      return false;
    }
    if (result.kind === 'proposal') {
      state.draft.markProposed(result.proposalId, result.patchDigest);
      state.proposed++;
      state.terminal.write(
        `Proposal ${result.proposalId} recorded (${result.validation.label}). Committed source is unchanged.\n`,
      );
    } else {
      state.draft.adopt(result.snapshot);
      state.saved++;
      state.intent = null;
      state.terminal.write(
        `Saved revision ${result.snapshot.sourceRevision}. ${result.snapshot.validation.label}\n`,
      );
    }
    return true;
  } catch (error) {
    if (error instanceof WizardBack) return false;
    state.terminal.write(
      `Save failed; pending edits retained. ${String((error as { code?: string }).code ?? 'ERROR')}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return false;
  }
}
