import type { IntakeRecovery } from './state.js';
/** An interrupted import against a project that already exists. The original
 * bytes are retained locally until the user resumes or discards them. */
export function Recovery({
  recovery,
  busy,
  onResume,
  onDiscard,
}: {
  recovery: IntakeRecovery;
  busy: boolean;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const remaining = recovery.total - recovery.imported;
  return (
    <section className="intake-recovery" aria-live="polite" aria-labelledby="intake-recovery-title">
      <h2 id="intake-recovery-title">Project created, import interrupted</h2>
      <p>
        {recovery.imported} of {recovery.total} planning inputs saved. {remaining} still waiting in memory with
        the same identities, so resuming cannot duplicate saved files.
      </p>
      {recovery.error && <p className="notice error">{recovery.error}</p>}
      <div className="intake-submit">
        <button type="button" disabled={busy} onClick={onDiscard}>
          Discard remaining files
        </button>
        <button type="button" className="primary" disabled={busy} onClick={onResume}>
          {busy ? 'Working locally…' : 'Resume import'}
        </button>
      </div>
    </section>
  );
}
