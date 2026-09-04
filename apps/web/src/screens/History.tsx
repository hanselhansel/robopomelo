import { useState } from 'react';
import type { Actor, FieldDiff, ProjectSnapshot, ValidationReport } from '@robopomelo/spec';
import type { WriteResult } from '../lib/draft.js';
import { api, expected } from '../lib/api.js';
import { useResource, useAction } from '../lib/hooks.js';
import { PagedList, TextInput, Modal, ErrorNotice } from '../components/ui.js';
import { DiffView } from '../components/DocumentView.js';
export interface HistoryEntry {
  sourceRevision: string;
  sourceHash: string;
  timestamp: string;
  actor: Actor | null;
  diff: FieldDiff[];
  origin: string;
}
interface RestorePreview {
  expected: { sourceRevision: string; sourceHash: string };
  diff: FieldDiff[];
  validation?: ValidationReport;
  blockedBy?: { code: string; message: string }[];
}
interface HistoryRead {
  entry: HistoryEntry;
  snapshot: ProjectSnapshot;
  rawText: string;
}
export function History({
  snapshot,
  onRefresh,
}: {
  snapshot: ProjectSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const resource = useResource<HistoryEntry[]>('/api/history');
  const [selected, setSelected] = useState<HistoryRead | null>(null);
  const [restore, setRestore] = useState(false);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [actor, setActor] = useState('');
  const [purpose, setPurpose] = useState('');
  const action = useAction();
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">Revision recovery</p>
        <h1 id="section-heading" tabIndex={-1}>
          History
        </h1>
        <p className="lede">
          Inspect immutable revisions and their provenance. Restoring creates a new revision and reevaluates
          earlier decisions.
        </p>
      </div>
      <ErrorNotice message={resource.error ?? action.error} />
      {resource.data && (
        <PagedList
          items={[...resource.data].reverse()}
          label="revisions"
          searchText={(r) => `${r.sourceRevision} ${r.timestamp} ${r.actor?.name ?? ''}`}
        >
          {(r) => (
            <div className="history-row" key={r.sourceRevision}>
              <div>
                <strong>{r.sourceRevision}</strong>
                <p>
                  {r.timestamp} · {r.actor?.name ?? 'Initial source'}
                </p>
              </div>
              <button
                onClick={() =>
                  void action.run(async () =>
                    setSelected(
                      await api.request<HistoryRead>(`/api/history/${encodeURIComponent(r.sourceRevision)}`),
                    ),
                  )
                }
              >
                Compare revision
              </button>
            </div>
          )}
        </PagedList>
      )}
      {selected && (
        <section>
          <div className="section-title">
            <h2>Revision {selected.entry.sourceRevision}</h2>
            <button
              onClick={() =>
                void action.run(async () => {
                  setRestorePreview(
                    await api.request<RestorePreview>(
                      `/api/history/${encodeURIComponent(selected.entry.sourceRevision)}/restore-preview`,
                    ),
                  );
                  setRestore(true);
                })
              }
            >
              Preview restore
            </button>
          </div>
          <p>
            {selected.entry.actor?.name ?? 'Initial source'} · {selected.entry.timestamp}
          </p>
          <DiffView diff={selected.entry.diff} />
          <details>
            <summary>Inspect source YAML</summary>
            <pre>{selected.rawText}</pre>
          </details>
        </section>
      )}
      {restore && selected && restorePreview && (
        <Modal title="Restore this authoring revision?" onClose={() => setRestore(false)}>
          <p>
            This creates a new revision from {selected.entry.sourceRevision}. Current review history and
            revocations remain retained. Earlier approval will be reevaluated.
          </p>
          <p>Current base: {restorePreview.expected.sourceRevision}</p>
          <DiffView diff={restorePreview.diff} />
          {restorePreview.validation && <p>{restorePreview.validation.label}</p>}
          {restorePreview.blockedBy?.map((issue, i) => (
            <p className="notice error" key={i}>
              {issue.message}
            </p>
          ))}
          <TextInput id="restore-actor" label="Restored by" value={actor} onChange={setActor} />
          <TextInput
            id="restore-purpose"
            label="Reason for restoring"
            value={purpose}
            onChange={setPurpose}
          />
          <ErrorNotice message={action.error} />
          <button
            className="primary"
            disabled={
              action.busy || !actor.trim() || !purpose.trim() || Boolean(restorePreview.blockedBy?.length)
            }
            onClick={() =>
              void action.run(async () => {
                const result = await api.request<WriteResult>(
                  `/api/history/${encodeURIComponent(selected.entry.sourceRevision)}/restore`,
                  {
                    expected: restorePreview.expected,
                    actor: { kind: 'human', name: actor },
                    purpose,
                    id: crypto.randomUUID(),
                  },
                );
                if (result.kind === 'conflict')
                  throw new Error(
                    'The source changed. This restore preview and supplied details remain available.',
                  );
                if (result.kind === 'proposal') {
                  action.setNotice('Restore is proposed. Open Changes to inspect it before applying.');
                  setRestore(false);
                  return;
                }
                await onRefresh();
                await resource.reload();
                setRestore(false);
                action.setNotice(
                  'Revision restored as a new committed source. Review status has been reevaluated.',
                );
              })
            }
          >
            Restore as new revision
          </button>
        </Modal>
      )}
      <p role="status">{action.notice}</p>
    </>
  );
}
