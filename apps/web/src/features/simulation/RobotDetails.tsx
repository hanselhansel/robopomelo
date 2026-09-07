import { reasonChain } from './poses.js';
import type { RunRecord, SimEvent } from './types.js';
/** Reason chain of a selected robot from recorded events: what it waited for,
 * which robot held it, whether it is part of the unresolved deadlock set. */
export function RobotDetails({ robotId, events, summary, eventsTruncated }: { robotId: string | null; events: SimEvent[]; summary: RunRecord; eventsTruncated: boolean }) {
  if (!robotId) return <p className="help">Select a robot on the overlay or in the list to inspect its reason chain.</p>;
  const chain = reasonChain(events, robotId);
  const deadlocked = summary.unresolved?.robotIds.includes(robotId) ?? false;
  const utilization = summary.metrics.utilization[robotId];
  return (
    <section className="sim-robot-details" aria-label={`Robot ${robotId}`}>
      <h4>{robotId}</h4>
      <p className="help">
        Profile {summary.robots.find((r) => r.id === robotId)?.profileId ?? 'unknown'}
        {utilization !== undefined ? `, busy ${(utilization * 100).toFixed(0)}% of the recorded horizon` : ''}
      </p>
      {deadlocked && <p className="sim-label deadlock">Deadlock member: unresolved with {summary.unresolved!.robotIds.filter((id) => id !== robotId).join(', ') || 'no other robot'} over {summary.unresolved!.resourceIds.join(', ')}</p>}
      {chain.length === 0 ? <p className="help">No recorded events for this robot{eventsTruncated ? ' in the loaded window' : ''}.</p> : (
        <ol className="sim-reasons" aria-label={`Recent events for ${robotId}`}>
          {chain.map((r, i) => <li key={`${r.tick}-${i}`}><small>tick {r.tick}, {r.kind}</small> {r.text}</li>)}
        </ol>
      )}
      {eventsTruncated && <p className="help">Only the first loaded event window is shown.</p>}
    </section>
  );
}
