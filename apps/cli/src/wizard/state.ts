import type { Actor, PatchEnvelope } from '@robopomelo/spec';
import type { CommandContext } from '../commands/types.js';
import type { WizardDraft } from './draft.js';
import type { TerminalAdapter } from './terminal.js';
export interface WizardState {
  context: CommandContext;
  terminal: TerminalAdapter;
  draft: WizardDraft;
  actor: Actor | null;
  purpose: string | null;
  intent: { key: string; patch: PatchEnvelope } | null;
  saved: number;
  proposed: number;
  toolProposals?: string[];
}
