import type { Actor } from '@robopomelo/spec';
import { back, requiredText, WizardBack, type TerminalAdapter } from './terminal.js';
export async function editActor(
  terminal: TerminalAdapter,
  previous?: Actor,
  humanOnly = false,
): Promise<Actor> {
  const kind = await terminal.choose(humanOnly ? 'Supplied human decision actor' : 'Mutation recorder kind', [
    { value: 'human', label: 'Human' },
    { value: 'external', label: 'External' },
    ...(humanOnly ? [] : [{ value: 'agent', label: 'Agent' }]),
    back,
  ]);
  if (kind === 'back') throw new WizardBack();
  const name = await requiredText(terminal, 'Supplied actor name', previous?.name),
    onBehalfOf = await terminal.text('On behalf of (optional)', previous?.onBehalfOf),
    source = await terminal.text('Actor provenance/source (optional)', previous?.source);
  return {
    kind: kind as Actor['kind'],
    name,
    ...(onBehalfOf ? { onBehalfOf } : {}),
    ...(source ? { source } : {}),
  };
}
