import { useState } from 'react';
import type {
  Evidence as EvidenceRecord,
  ObservedEvidence,
  ProjectSnapshot,
  MutationReceipt,
  Knowledge,
} from '@robopomelo/spec';
import type { WriteResult } from '../lib/draft.js';
import { api, expected, ApiError } from '../lib/api.js';
import { useResource, useAction, download } from '../lib/hooks.js';
import { AddEvidence } from './AddEvidence.js';
import { Modal, ErrorNotice, TextInput, PagedList } from '../components/ui.js';
import { KnowledgeField } from '../components/KnowledgeField.js';
import { References, referenceOptions } from '../components/References.js';
interface EvidenceData {
  records: EvidenceRecord[];
  observations: ObservedEvidence[];
}
export function Evidence({
  snapshot,
  onRefresh,
  onView,
  onSettings,
}: {
  snapshot: ProjectSnapshot;
  onRefresh: () => Promise<void>;
  onView: (id: string) => void;
  onSettings: () => void;
}) {
  const resource = useResource<EvidenceData>('/api/evidence');
  const [purpose, setPurpose] = useState('all');
  const [location, setLocation] = useState('all');
  const [adding, setAdding] = useState(false);
  const action = useAction();
  const refresh = async () => {
    await onRefresh();
    await resource.reload();
  };
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">Sources and future support</p>
        <h1 id="section-heading" tabIndex={-1}>
          Evidence
        </h1>
        <p className="lede">
          Keep planning sources, future acceptance requirements and decision evidence distinct.
        </p>
      </div>
      <div className="actions">
        <button className="primary" onClick={() => setAdding(true)}>
          Add evidence
        </button>
        <button
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await api.request('/api/evidence/check', {});
              await refresh();
              action.setNotice('Evidence check complete. Observation times are shown below.');
            })
          }
        >
          {action.busy ? 'Checking files' : 'Check evidence'}
        </button>
      </div>
      <div className="filters">
        <div>
          <label htmlFor="evidence-purpose">Purpose</label>
          <select id="evidence-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            <option value="all">All purposes</option>
            <option value="planning">Planning</option>
            <option value="acceptance-requirement">Acceptance requirement</option>
            <option value="decision">Decision</option>
          </select>
        </div>
        <div>
          <label htmlFor="evidence-location">Location</label>
          <select id="evidence-location" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="all">All locations</option>
            <option value="attachment">Attachment</option>
            <option value="external">External</option>
            <option value="future">Future</option>
          </select>
        </div>
      </div>
      <ErrorNotice message={resource.error ?? action.error} />
      {resource.data && (
        <PagedList
          items={resource.data.records.filter(
            (e) =>
              (purpose === 'all' || e.purpose === purpose) &&
              (location === 'all' || e.location.kind === location),
          )}
          label="evidence records"
          searchText={(e) => `${e.title} ${e.id}`}
        >
          {(e) => {
            const observed = resource.data!.observations.find((o) => o.evidenceId === e.id);
            return (
              <article key={e.id} className="evidence-record">
                <div className="section-title">
                  <h2>{e.title}</h2>
                  <button onClick={() => onView(e.id)}>Edit details</button>
                </div>
                <p className="meta">
                  {e.purpose.replaceAll('-', ' ')} · {e.location.kind} ·{' '}
                  {e.required ? 'Required support' : 'Optional support'}
                </p>
                <p
                  className={`notice ${observed?.state === 'missing' || observed?.state === 'mismatch' || observed?.state === 'unreadable' ? 'warning' : 'subtle'}`}
                >
                  {observed ? `Observation: ${observed.state}` : 'Not yet checked'}
                  <br />
                  {observed?.checkedAt
                    ? `Checked ${observed.checkedAt}`
                    : 'No local file observation was performed.'}
                </p>
                {e.location.kind === 'future' ? (
                  <p>{e.location.description}</p>
                ) : e.location.kind === 'external' ? (
                  <p className="break-anywhere">
                    External reference: {e.location.uri}. This address is not fetched by RoboPomelo.
                  </p>
                ) : (
                  <>
                    <p className="break-anywhere">Attachment: {e.location.path}</p>
                    <p className="meta">
                      {e.location.size.toLocaleString()} bytes · SHA-256 {e.location.sha256}
                    </p>
                    <button
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          const response = await api.raw(
                            `/api/evidence/${encodeURIComponent(e.id)}/download`,
                          );
                          if (!response.ok) {
                            const failure = (await response.json()) as {
                              error: { code: string; message: string };
                            };
                            throw new ApiError(failure.error.code, failure.error.message);
                          }
                          download(
                            await response.blob(),
                            e.location.kind === 'attachment'
                              ? (e.location.path.split('/').at(-1) ?? 'evidence-attachment')
                              : 'evidence-attachment',
                          );
                          action.setNotice(`Downloaded ${e.title}.`);
                        })
                      }
                    >
                      Download attachment
                    </button>
                  </>
                )}
              </article>
            );
          }}
        </PagedList>
      )}
      <p role="status">{action.notice}</p>
      {adding && (
        <AddEvidence
          snapshot={snapshot}
          onClose={() => setAdding(false)}
          onRefresh={refresh}
          onSettings={onSettings}
        />
      )}
    </>
  );
}
