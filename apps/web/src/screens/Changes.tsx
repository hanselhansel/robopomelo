import { useState } from 'react';
import type { PatchEnvelope, FieldDiff, ProjectSnapshot, Mutation, Actor } from '@robopomelo/spec';
import type { WriteResult, DraftController } from '../lib/draft.js';
import { api, expected } from '../lib/api.js';
import { useResource, useAction } from '../lib/hooks.js';
import { PagedList, ErrorNotice } from '../components/ui.js';
import type { HistoryEntry } from './History.js';
import { DiffView } from '../components/DocumentView.js';
export interface ProposalSummary {
  id: string;
  patchDigest: string;
  baseRevision: string;
  baseHash: string;
  patch?: PatchEnvelope;
  mutation: Mutation;
  purpose: string;
  actor: Actor;
  receiptDigest: string;
  diff: FieldDiff[];
  status: 'pending' | 'superseded' | 'applied';
}
export function Changes({
  snapshot,
  draft,
  onResume,
}: {
  snapshot: ProjectSnapshot;
  draft: DraftController;
  onResume: (proposal: ProposalSummary) => void;
}) {
  const resource = useResource<ProposalSummary[]>('/api/proposals');
  const history = useResource<HistoryEntry[]>('/api/history');
  const [tab, setTab] = useState<'pending' | 'applied'>('pending');
  const action = useAction();
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">Planning change review</p>
        <h1 id="section-heading" tabIndex={-1}>
          Changes
        </h1>
        <p className="lede">Inspect exact field changes and their source base before applying a proposal.</p>
      </div>
      <div className="view-switch">
        <button aria-pressed={tab === 'pending'} onClick={() => setTab('pending')}>
          Pending
        </button>
        <button aria-pressed={tab === 'applied'} onClick={() => setTab('applied')}>
          Applied and superseded
        </button>
      </div>
      <ErrorNotice message={resource.error ?? action.error} />
      {resource.loading && <p>Loading changes</p>}
      {resource.data && (
        <PagedList
          items={resource.data.filter((p) =>
            tab === 'pending' ? p.status === 'pending' : p.status !== 'pending',
          )}
          label="changes"
          searchText={(p) => `${p.id} ${p.purpose}`}
        >
          {(p) => (
            <details className="record" key={p.id}>
              <summary>
                <span>{p.purpose}</span>
                <small>
                  {p.status} · {p.id}
                </small>
              </summary>
              <div className="record-editor">
                <p>
                  Committed base: {p.baseRevision}
                  <br />
                  Proposal: {p.id}
                </p>
                <p className="meta break-anywhere">Approved patch digest: {p.patchDigest}</p>
                <DiffView diff={p.diff} />
                {p.baseRevision !== snapshot.sourceRevision || p.baseHash !== snapshot.sourceHash ? (
                  <p className="notice warning">
                    The committed source has changed. This proposal remains inspectable, but must be resolved
                    against the current source.
                  </p>
                ) : (
                  p.status === 'pending' && (
                    <div className="actions">
                      {p.patch && <button onClick={() => onResume(p)}>Continue editing proposal</button>}
                      <button
                        className="primary"
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(async () => {
                            await draft.applyProposal(
                              p.id,
                              {
                                sourceRevision: p.baseRevision,
                                sourceHash: p.baseHash,
                              },
                              async () => {
                                const result = await api.request<WriteResult>(
                                  `/api/proposals/${encodeURIComponent(p.id)}/apply`,
                                  {
                                    expected: expected(snapshot),
                                    approvedPatchDigest: p.patchDigest,
                                  },
                                );
                                if (result.kind !== 'committed')
                                  throw new Error(
                                    'The proposal has not been committed. Its original diff is retained.',
                                  );
                                return result.snapshot;
                              },
                            );
                            await resource.reload();
                            await history.reload();
                            action.setNotice(`Proposal ${p.id} applied to a committed revision.`);
                          })
                        }
                      >
                        Apply exact proposal
                      </button>
                    </div>
                  )
                )}
              </div>
            </details>
          )}
        </PagedList>
      )}
      {tab === 'applied' && history.data && (
        <section>
          <h2>Applied revisions</h2>
          <PagedList
            items={[...history.data].reverse().filter((r) => r.origin === 'commit')}
            label="applied revisions"
            searchText={(r) => `${r.sourceRevision} ${r.actor?.name ?? ''}`}
          >
            {(r) => (
              <details className="record" key={r.sourceRevision}>
                <summary>
                  {r.sourceRevision}
                  <small>
                    {r.timestamp} · {r.actor?.name ?? 'Source author'}
                  </small>
                </summary>
                <DiffView diff={r.diff} />
              </details>
            )}
          </PagedList>
        </section>
      )}
      <p role="status">{action.notice}</p>
    </>
  );
}
