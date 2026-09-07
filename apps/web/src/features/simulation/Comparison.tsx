import { useEffect, useRef, useState } from 'react';
import type { Comparison as Result, ComparedRun, RunStatus } from './types.js';
const short = (id: string) => id.slice(0, 8);
const num = (v: number | null, digits = 1) => (v === null ? 'not measured' : v.toFixed(digits));
const stored = (r: RunStatus) => r.state === 'stored';
/** Labels that travel with every run row; a stale or partial run stays visible but cannot pass as validated current execution. */
export function RunLabels({ run }: { run: { partial: boolean | null; stale: boolean; termination?: string | null } }) {
  return (
    <>
      {run.partial && <span className="sim-label partial">Partial</span>}
      {run.stale && <span className="sim-label stale">Stale</span>}
      {run.termination && run.termination !== 'completed' && <span className="sim-label">{run.termination}</span>}
    </>
  );
}
/** Baseline is a fixed stored run the user picks. It defaults exactly once to
 * the first valid completed run and never advances when newer runs finish. */
export function Comparison({ runs, comparison, busy, onCompare }: { runs: RunStatus[]; comparison: Result | null; busy: boolean; onCompare: (baselineRunId: string, alternativeRunIds: string[]) => Promise<void> }) {
  const [baseline, setBaseline] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current) return;
    const first = runs.find((r) => stored(r) && r.partial === false);
    if (first) { defaulted.current = true; setBaseline(first.runId); }
  }, [runs]);
  const candidates = runs.filter(stored);
  const baseRun = candidates.find((r) => r.runId === baseline) ?? null;
  const sameWorkload = (r: RunStatus) => baseRun !== null && r.workloadHash === baseRun.workloadHash;
  const toggle = (id: string) => setAlternatives((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const chosen = alternatives.filter((id) => candidates.some((r) => r.runId === id && id !== baseline));
  return (
    <section className="sim-compare" aria-label="Comparison">
      <label>Baseline run
        <select value={baseline ?? ''} onChange={(e) => { defaulted.current = true; setBaseline(e.target.value || null); }}>
          <option value="">Choose a stored run</option>
          {candidates.map((r) => <option key={r.runId} value={r.runId}>{short(r.runId)} seed {r.seed}{r.partial ? ' (partial)' : ''}{r.stale ? ' (stale)' : ''}</option>)}
        </select>
      </label>
      {baseRun && (
        <p className="help">Baseline source revision {baseRun.sourceRevision}, input {short(baseRun.inputHash ?? '')}, workload {short(baseRun.workloadHash ?? '')}. <RunLabels run={baseRun} /></p>
      )}
      <fieldset className="sim-alternatives">
        <legend>Alternatives (same workload only)</legend>
        {candidates.filter((r) => r.runId !== baseline).map((r) => (
          <label key={r.runId} className={sameWorkload(r) ? '' : 'sim-mismatch'}>
            <input type="checkbox" checked={chosen.includes(r.runId)} disabled={!sameWorkload(r)} onChange={() => toggle(r.runId)} />
            {short(r.runId)} seed {r.seed} <RunLabels run={r} />{!sameWorkload(r) && <span className="help"> different workload</span>}
          </label>
        ))}
      </fieldset>
      <button type="button" className="primary" disabled={busy || !baseRun || !chosen.length} onClick={() => baseline && void onCompare(baseline, chosen)}>Compare</button>
      {comparison && (comparison.comparable ? <TradeoffTable result={comparison} /> : <p className="sim-label stale" role="alert">Not comparable: runs {comparison.mismatched.map(short).join(', ')} use a different workload.</p>)}
    </section>
  );
}
function TradeoffTable({ result }: { result: Extract<Result, { comparable: true }> }) {
  const rows: ComparedRun[] = [result.baseline, ...result.alternatives];
  const names = result.baseline.objectives;
  return (
    <div className="sim-tradeoff">
      <p className="help">Same workload confirmed ({short(result.workloadHash)}). {result.preferred ? `Preferred on every objective: ${result.preferred.map(short).join(', ')}.` : `No single preference: ${{ OBJECTIVE_TRADEOFF: 'objectives disagree; all alternatives are kept', UNMEASURED: 'an objective is not measured', NO_COMPLETE_RUN: 'no complete run to rank', NO_OBJECTIVES: 'the scenario declares no objectives' }[result.undecided ?? 'NO_OBJECTIVES']}.`}</p>
      <table>
        <caption>Objective trade-offs against the baseline</caption>
        <thead><tr><th scope="col">Run</th><th scope="col">Labels</th>{names.map((o) => <th key={o.id} scope="col">{o.kind} ({o.unit}, {o.direction})</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.runId} className={result.preferred?.includes(row.runId) ? 'preferred' : ''}>
              <th scope="row">{i === 0 ? 'Baseline ' : ''}{short(row.runId)} seed {row.seed}</th>
              <td><RunLabels run={row} /></td>
              {row.objectives.map((o, j) => (
                <td key={o.id}>{num(o.measured)}{o.satisfied !== null && (o.satisfied ? ' meets' : ' misses')}{o.threshold !== null ? ` (target ${o.threshold})` : ''}{i > 0 && row.deltas[j]!.delta !== null ? ` ${row.deltas[j]!.delta! >= 0 ? '+' : ''}${row.deltas[j]!.delta!.toFixed(1)}` : ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.spreads.map((s) => (
        <p key={s.variantHash} className="help">Repeats of one configuration (seeds {s.seeds.join(', ')}): {s.objectives.map((o) => `${o.kind} ${num(o.min)} to ${num(o.max)}`).join('; ')}.</p>
      ))}
    </div>
  );
}
