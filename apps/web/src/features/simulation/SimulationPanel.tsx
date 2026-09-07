import { useState } from 'react';
import { ErrorNotice } from '../../components/ui.js';
import { Comparison, RunLabels } from './Comparison.js';
import { Playback } from './Playback.js';
import { RobotDetails } from './RobotDetails.js';
import { RunLimits } from './RunLimits.js';
import type { RobotPose } from './poses.js';
import { ACTIVE_STATES, type RunStatus } from './types.js';
import { useSimulation } from './useSimulation.js';
import './simulation.css';
const STATE_TEXT: Record<RunStatus['state'], string> = { queued: 'Queued', running: 'Running', stored: 'Stored', interrupted: 'Interrupted', failed: 'Failed', cancelled: 'Cancelled' };
/** Fleet simulation: visible limits, run list with progress, playback of a
 * stored run, robot reason chains and baseline comparison. Every number shown
 * is a recorded measurement; nothing here calls a model. */
export function SimulationPanel({ onPoses, pollMs }: { onPoses?: ((tick: number, poses: RobotPose[]) => void) | undefined; pollMs?: number }) {
  const sim = useSimulation(pollMs === undefined ? {} : { pollMs });
  const [robotId, setRobotId] = useState<string | null>(null);
  const active = sim.runs.some((r) => ACTIVE_STATES.has(r.state));
  const detail = sim.detail;
  return (
    <section className="sim-panel" aria-label="Fleet simulation">
      <div className="sim-head">
        <p className="eyebrow">Fleet simulation</p>
        <button type="button" onClick={() => void sim.refresh()} disabled={sim.busy}>Refresh runs</button>
      </div>
      <ErrorNotice message={sim.error} />
      <RunLimits scenarios={sim.scenarios} busy={sim.busy} active={active} onStart={sim.start} />
      {sim.runs.length === 0 ? <p className="help">No runs yet. Start one with the limits above.</p> : (
        <table className="sim-runs">
          <caption>Runs</caption>
          <thead><tr><th scope="col">Run</th><th scope="col">State</th><th scope="col">Seed</th><th scope="col">Progress</th><th scope="col">Labels</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {sim.runs.map((r) => (
              <tr key={r.runId} aria-current={detail?.status.runId === r.runId ? 'true' : undefined}>
                <th scope="row"><code>{r.runId.slice(0, 8)}</code>{r.reused ? ' (reused)' : ''}</th>
                <td>{STATE_TEXT[r.state]}{r.error ? `: ${r.error}` : ''}</td>
                <td>{r.seed ?? ''}</td>
                <td>{r.state === 'running' || r.state === 'interrupted' ? `tick ${r.progressTick}${r.limits ? ` of ${r.limits.maxTicks}` : ''}` : r.durationTicks !== null ? `${r.durationTicks} ticks` : ''}</td>
                <td><RunLabels run={r} /></td>
                <td className="actions">
                  {ACTIVE_STATES.has(r.state) && <button type="button" onClick={() => void sim.cancel(r.runId)} disabled={sim.busy}>Cancel</button>}
                  {r.state === 'stored' && <button type="button" onClick={() => { setRobotId(null); void sim.open(r.runId); }} disabled={sim.busy}>Open</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {detail && (
        <section className="sim-detail" aria-label={`Run ${detail.status.runId.slice(0, 8)}`}>
          <h3>Run {detail.status.runId.slice(0, 8)} <RunLabels run={detail.status} /></h3>
          <p className="help">
            Source revision {detail.manifest.sourceRevision}, seed {detail.manifest.seed}, {detail.manifest.policyVersion}, engine {detail.manifest.engineVersion}. {detail.summary.reason}.
            {detail.status.stale ? ' The source changed since this run: its results describe the recorded revision, not the current scene.' : ''}
            {detail.summary.metrics.partial ? ' Partial run: objective scores are not claimed for the full horizon.' : ''}
          </p>
          <dl className="sim-metrics">
            <dt>Jobs</dt><dd>{detail.summary.ledger.completed} completed, {detail.summary.ledger.failed} failed, {detail.summary.ledger.cancelled} cancelled, {detail.summary.ledger.queued + detail.summary.ledger.active} open of {detail.summary.ledger.released} released</dd>
            <dt>Throughput</dt><dd>{detail.summary.metrics.throughputPerHour.toFixed(1)} jobs/h over {detail.summary.metrics.horizonTicks} ticks</dd>
            <dt>Wait p95</dt><dd>{detail.summary.metrics.p95WaitTicks === null ? 'not measured' : `${(detail.summary.metrics.p95WaitTicks / 10).toFixed(1)} s`}</dd>
          </dl>
          <ul className="sim-objectives" aria-label="Objectives">
            {detail.objectives.map((o) => <li key={o.id}>{o.kind}: {o.measured === null ? 'not measured' : `${o.measured.toFixed(1)} ${o.unit}`}{o.threshold !== null ? `, target ${o.direction === 'maximize' ? 'at least' : 'at most'} ${o.threshold}` : ''} {o.satisfied === null ? '(open)' : o.satisfied ? '(met)' : '(missed)'}</li>)}
          </ul>
          <Playback summary={detail.summary} durationTicks={detail.manifest.durationTicks} selectedRobotId={robotId} onSelectRobot={setRobotId} onPoses={onPoses} />
          <RobotDetails robotId={robotId} events={sim.events?.events ?? []} summary={detail.summary} eventsTruncated={(sim.events?.total ?? 0) > (sim.events?.events.length ?? 0)} />
        </section>
      )}
      <Comparison runs={sim.runs} comparison={sim.comparison} busy={sim.busy} onCompare={sim.compare} />
      <p className="visually-hidden" role="status" aria-live="polite" aria-label="Simulation status">{sim.status}</p>
    </section>
  );
}
