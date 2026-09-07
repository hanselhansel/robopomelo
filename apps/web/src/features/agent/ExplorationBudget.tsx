import { useId, useState } from 'react';
import './exploration.css';
import type { ExplorationBudget as Limits } from '@robopomelo/spec';
/** Local mirrors of packages/agent/src/{budget,exploration}.ts views. The web
 * package cannot import @robopomelo/agent; keep these in step by hand. */
export type StopReason = 'COMPLETED' | 'BUDGET_REACHED' | 'CANCELLED' | 'TOOL_TIMEOUT' | 'RATE_LIMITED' | 'FALLBACK_DENIED';
export type ExperimentStatus = 'planned' | 'proposing' | 'simulating' | 'completed' | 'partial' | 'failed';
export interface ExperimentView {
  index: number;
  variant: { id: string; connectionId: string; label: string; params: Record<string, number> } | null;
  status: ExperimentStatus;
  result: unknown;
  stopReason: StopReason | null;
  error: string | null;
}
export interface ExplorationBudgetView {
  runId: string;
  generation: number;
  active: boolean;
  planned: { index: number; reserved: { modelTurns: number; maxOutputTokens: number; simulationWallMs: number } }[];
  experiments: ExperimentView[];
  stop: { reason: StopReason; detail: string };
  ledger: { limits: Limits; pending: Limits; consumed: Limits; remaining: Limits; usageUnknown: boolean };
}
export type CostView = { usd: number | null; state: 'settled' | 'pending' | 'unknown' };
const STATUS_TEXT: Record<ExperimentStatus, string> = { planned: 'Planned', proposing: 'Asking the model', simulating: 'Simulating', completed: 'Completed', partial: 'Partial', failed: 'Failed' };
const STOP_TEXT: Record<StopReason, string> = {
  COMPLETED: 'every planned experiment finished', BUDGET_REACHED: 'budget reached', CANCELLED: 'cancelled', TOOL_TIMEOUT: 'a local tool timed out',
  RATE_LIMITED: 'the provider rate limited the run', FALLBACK_DENIED: 'a different connection was refused',
};
const DIMENSIONS: { key: keyof Limits; label: string; unit: string }[] = [
  { key: 'modelTurns', label: 'Model turns', unit: 'model turns' },
  { key: 'maxOutputTokens', label: 'Output tokens', unit: 'output tokens' },
  { key: 'simulationWallMs', label: 'Simulation ms', unit: 'ms of simulation' },
  { key: 'variants', label: 'Variants', unit: 'variants' },
  { key: 'workers', label: 'Workers', unit: 'workers' },
];
const whole = (value: string): number | null => (/^\d+$/.test(value) ? Number(value) : null);
/** Planned experiments, results, stop reason and the remaining budget per
 * dimension. Changing the displayed limits here is the only way to explore
 * deeper; ordinary steps never ask for a permission click. */
export function ExplorationBudget({ view, cost, onExtend }: { view: ExplorationBudgetView; cost: CostView; onExtend: (limits: Limits) => Promise<void> }) {
  const id = useId();
  const { limits, remaining } = view.ledger;
  const [fields, setFields] = useState<Record<keyof Limits, string>>(() => Object.fromEntries(DIMENSIONS.map((d) => [d.key, String(limits[d.key])])) as Record<keyof Limits, string>);
  const parsed = Object.fromEntries(DIMENSIONS.map((d) => [d.key, whole(fields[d.key])])) as Record<keyof Limits, number | null>;
  const valid = DIMENSIONS.every((d) => parsed[d.key] !== null && parsed[d.key]! >= limits[d.key]);
  const deeper = valid && DIMENSIONS.some((d) => parsed[d.key]! > limits[d.key]);
  const canExtend = deeper && !view.active;
  const costText = cost.state === 'pending' ? 'Cost pending' : cost.state === 'unknown' || cost.usd === null ? 'Cost unknown' : `$${cost.usd.toFixed(6)}`;
  return (
    <section className="agent-exploration" aria-labelledby={`${id}-title`}>
      <p className="eyebrow" id={`${id}-title`}>Exploration</p>
      <p className="agent-exploration-plan">{view.planned.length} experiments planned</p>
      <ol className="agent-experiments">
        {view.planned.map((plan) => {
          const experiment = view.experiments[plan.index];
          return (
            <li key={plan.index} className={`agent-experiment ${experiment?.status ?? 'planned'}`}>
              <span className="agent-experiment-label">{experiment?.variant?.label ?? `Experiment ${plan.index + 1}`}</span>
              <span className="agent-experiment-status">{STATUS_TEXT[experiment?.status ?? 'planned']}</span>
              {experiment?.stopReason && <small className="help">{experiment.stopReason}</small>}
              <small className="help">Reserves {plan.reserved.modelTurns} turn, {plan.reserved.maxOutputTokens} tokens, {plan.reserved.simulationWallMs} ms</small>
            </li>
          );
        })}
      </ol>
      <p className="agent-exploration-stop">{view.active ? 'Running within the displayed limits.' : `Stopped: ${STOP_TEXT[view.stop.reason]}`}</p>
      {!view.active && view.stop.detail && <p className="help">{view.stop.detail}</p>}
      <ul className="agent-budget-dimensions" aria-label="Remaining budget">
        {DIMENSIONS.map((d) => (
          <li key={d.key}>
            {remaining[d.key]} of {limits[d.key]} {d.unit} left
            {view.ledger.pending[d.key] > 0 && <small className="help"> ({view.ledger.pending[d.key]} pending)</small>}
          </li>
        ))}
      </ul>
      <p className={`agent-exploration-cost ${cost.state}`}>{costText}</p>
      {view.ledger.usageUnknown && <p className="help">The provider did not report usage for at least one request; the reserved upper bound stays counted.</p>}
      <form
        className="agent-extend"
        aria-label="Change exploration limits"
        onSubmit={(event) => {
          event.preventDefault();
          if (canExtend) void onExtend(parsed as Limits);
        }}
      >
        <p className="help">Raise a displayed limit to allow deeper exploration. Nothing else grants more budget.</p>
        {DIMENSIONS.map((d) => (
          <label key={d.key} className="agent-extend-field">
            {d.label}
            <input inputMode="numeric" value={fields[d.key]} min={limits[d.key]} onChange={(event) => setFields({ ...fields, [d.key]: event.target.value })} />
          </label>
        ))}
        <button type="submit" className="primary" disabled={!canExtend}>
          Allow deeper exploration
        </button>
      </form>
    </section>
  );
}
