import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api.js';
import type { DraftView } from '../lib/draft.js';

type Identity = { sourceHash: string } | { unavailable: true };
export const canRefreshSource = (view: DraftView) =>
  !view.dirty && view.state === 'Saved' && !view.proposalId;

export function ExternalSourceNotice({
  view,
  onRefresh,
  onCompare,
}: {
  view: DraftView;
  onRefresh: () => Promise<void>;
  onCompare: () => void;
}) {
  const [observed, setObserved] = useState<{ identity: Identity; baseHash: string } | null>(null);
  const committedHash = useRef(view.committed.sourceHash);
  committedHash.current = view.committed.sourceHash;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stopped = false;
    let active: AbortController | undefined;
    const poll = async () => {
      if (stopped || active || document.visibilityState === 'hidden') return;
      const request = new AbortController();
      const baseHash = committedHash.current;
      active = request;
      try {
        const result = await api.request<Identity>(
          '/api/project/source-identity',
          undefined,
          true,
          'GET',
          request.signal,
        );
        if (!stopped && committedHash.current === baseHash) setObserved({ identity: result, baseHash });
      } catch {
        if (!stopped && committedHash.current === baseHash)
          setObserved({ identity: { unavailable: true }, baseHash });
      } finally {
        if (active === request) active = undefined;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    const visible = () => {
      void poll();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      active?.abort();
    };
  }, []);
  const identity = observed?.baseHash === view.committed.sourceHash ? observed.identity : null;
  if (!identity || ('sourceHash' in identity && identity.sourceHash === view.committed.sourceHash))
    return null;
  return (
    <section className="notice" aria-label="External source update" role="status">
      <p>
        {'unavailable' in identity
          ? 'The source is unavailable. Your current view is retained.'
          : 'The source changed outside this view. Your current input is retained.'}
      </p>
      {canRefreshSource(view) ? (
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void onRefresh()
              .catch((reason) => setError(errorMessage(reason)))
              .finally(() => setBusy(false));
          }}
        >
          Recheck source
        </button>
      ) : (
        <>
          <p>Keep your pending input. Compare the current source before resolving your changes.</p>
          <button onClick={onCompare}>Compare external source</button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
