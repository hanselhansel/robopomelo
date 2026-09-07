import type { AgentEvent, RunKey } from '@robopomelo/spec';
/** Events from an older generation or a different run never apply. */
export function acceptEvent(current: RunKey, event: AgentEvent, last: number): boolean {
  return event.runId === current.runId && event.generation === current.generation && event.sequence > last;
}
export function reserveTurn(remaining: number): number {
  if (!Number.isSafeInteger(remaining) || remaining <= 0) throw new Error('BUDGET_REACHED');
  return remaining - 1;
}
