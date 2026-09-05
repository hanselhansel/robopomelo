import { useEffect, useState } from 'react';
import { api, errorMessage } from './lib/api.js';
import type { ProjectRead, Session } from './lib/api.js';
import { Welcome } from './screens/Welcome.js';
import { ErrorNotice } from './components/ui.js';
import { Workspace } from './Workspace.js';
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [read, setRead] = useState<ProjectRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historical, setHistorical] = useState<string | null>(null);
  useEffect(() => {
    void api
      .bootstrap()
      .then(async (s) => {
        setSession(s);
        if (s.projectOpen) setRead(await api.request<ProjectRead>('/api/project'));
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (error)
    return (
      <main className="welcome">
        <h1>Reconnect to RoboPomelo</h1>
        <ErrorNotice message={error} />
        <p>
          Open the fresh local launch link from your terminal. The one-time session link belongs only to this
          browser tab.
        </p>
        <button onClick={() => location.reload()}>Retry connection</button>
      </main>
    );
  if (!session)
    return (
      <main className="welcome">
        <h1>Opening local workspace</h1>
        <p>Establishing this browser session.</p>
      </main>
    );
  if (!read)
    return (
      <Welcome
        onOpen={(r) => {
          setSession(api.session);
          setRead(r);
        }}
      />
    );
  if (read.kind === 'inspection')
    return (
      <main className="welcome">
        <h1>Source needs inspection</h1>
        <p>The local source cannot be loaded as an editable project. Its bytes remain unchanged.</p>
        {read.problems.map((p, i) => (
          <p key={i} className="notice error">
            {p.message}
          </p>
        ))}
        <details>
          <summary>Inspect source text</summary>
          <pre>{read.rawText}</pre>
        </details>
        {read.lastReadable && (
          <>
            <p>Last readable revision: {read.lastReadable.sourceRevision}</p>
            <button
              onClick={() =>
                void api
                  .request<{ rawText: string }>(
                    `/api/history/${encodeURIComponent(read.lastReadable!.sourceRevision)}`,
                  )
                  .then((result) => setHistorical(result.rawText))
                  .catch((e) => setError(errorMessage(e)))
              }
            >
              Inspect last readable source
            </button>
          </>
        )}
        {historical && (
          <details open>
            <summary>Last readable source (inspection only)</summary>
            <pre>{historical}</pre>
          </details>
        )}
        <button
          onClick={() =>
            void api
              .request<ProjectRead>('/api/project')
              .then(setRead)
              .catch((e) => setError(errorMessage(e)))
          }
        >
          Recheck source
        </button>
        <button onClick={() => setRead(null)}>Switch project</button>
      </main>
    );
  return (
    <Workspace
      key={session.projectEpoch}
      initial={read.snapshot}
      onSwitch={() => setRead(null)}
      onInspection={setRead}
    />
  );
}
