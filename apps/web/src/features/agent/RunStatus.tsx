import type { AgentEvent } from '@robopomelo/spec';
import type { RunSnapshot } from './types.js';
const STATE_TEXT: Record<RunSnapshot['state'], string> = {
  idle: 'Ready',
  reserved: 'Preparing a turn',
  running: 'Working',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
const ACTIVE = new Set<RunSnapshot['state']>(['reserved', 'running']);
/** Run state, remaining budget and the controls that must stay reachable while
 * the model works. The live region announces settled outcomes only. */
export function RunStatus({
  run,
  events,
  status,
  busy,
  onCancel,
  onExtend,
}: {
  run: RunSnapshot | null;
  events: AgentEvent[];
  status: string;
  busy: boolean;
  onCancel: () => Promise<void>;
  onExtend: (turns: number) => Promise<void>;
}) {
  const active = run !== null && ACTIVE.has(run.state);
  const budgetPaused = run?.state === 'paused' && run.reason === 'BUDGET_REACHED';
  return (
    <div className="agent-run">
      <div className="agent-run-line">
        <span className={`agent-run-state ${run?.state ?? 'idle'}`}>{run ? STATE_TEXT[run.state] : busy ? 'Sending' : 'Ready'}</span>
        {run && (
          <span className="help">
            {run.remaining.modelTurns} of {run.budget.modelTurns} model turns left
          </span>
        )}
        <button type="button" disabled={!active} aria-describedby="agent-cancel-help" onClick={() => void onCancel()}>
          Cancel turn
        </button>
      </div>
      <p className="help" id="agent-cancel-help">
        {active ? 'Stops the model now. Usage already accepted by the provider still counts.' : 'Available while a turn is running.'}
      </p>
      {budgetPaused && (
        <div className="agent-budget">
          <p>Budget reached</p>
          <p className="help">Exploration stopped at the displayed limit. Raise it explicitly to continue.</p>
          <button type="button" className="primary" onClick={() => void onExtend(4)}>
            Allow 4 more turns
          </button>
        </div>
      )}
      {run?.state === 'failed' && run.reason && <p className="help">Reason: {run.reason}</p>}
      {events.length > 0 && (
        <details className="agent-events" open={active}>
          <summary>Run log ({events.length})</summary>
          <ol>
            {events.map((event) => (
              <li key={`${event.runId}-${event.generation}-${event.sequence}`}>
                <small>{event.kind}</small> {event.text}
              </li>
            ))}
          </ol>
        </details>
      )}
      <p className="visually-hidden" role="status" aria-live="polite" aria-label="Agent status">
        {status}
      </p>
    </div>
  );
}
