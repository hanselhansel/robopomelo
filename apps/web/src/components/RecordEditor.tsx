import { useState } from 'react';
import { fields } from '@robopomelo/spec/browser';
import type { Collection, Deployment, Json, PatchOperation } from '@robopomelo/spec';
import { SuppliedRecorder } from './SuppliedRecorder.js';
import { Field } from './Field.js';
import { Modal, TextInput } from './ui.js';
import { collectionLabels } from '../lib/records.js';
export function RecordEditor({
  collection,
  record,
  deployment,
  edit,
  onView,
}: {
  collection: Collection;
  record: Deployment[Collection][number];
  deployment: Deployment;
  edit: (op: PatchOperation) => void;
  onView: (id: string) => void;
}) {
  const [remove, setRemove] = useState(false);
  const update = (path: string, value: Json) =>
    edit({ op: 'update', collection, id: record.id, fields: { [path]: value } });
  const dependents = Object.entries(deployment)
    .filter(([key, value]) => Array.isArray(value))
    .flatMap(([key, rows]) =>
      (rows as { id: string; title?: string }[])
        .filter((r) => r.id !== record.id && JSON.stringify(r).includes(JSON.stringify(record.id)))
        .map((r) => ({ collection: key, id: r.id, title: r.title ?? r.id })),
    );
  return (
    <div className="record-editor" id={`record-${record.id}`}>
      <p className="eyebrow">
        {collectionLabels[collection]} <code>{record.id}</code>
      </p>
      {fields
        .filter((f) => f.collection === collection)
        .map((f) => (
          <Field
            key={f.path}
            definition={f}
            id={record.id}
            value={(record as unknown as Record<string, unknown>)[f.path]}
            deployment={deployment}
            onChange={(v) => update(f.path, v)}
            onView={onView}
          />
        ))}
      {collection === 'evidence' && 'location' in record && record.location.kind === 'future' && (
        <TextInput
          id={`${record.id}-future`}
          label="Future evidence description"
          value={record.location.description}
          onChange={(description) => update('location', { kind: 'future', description })}
        />
      )}{' '}
      {collection === 'decisions' && 'state' in record && record.state === 'accepted' && (
        <fieldset>
          <legend>Explicitly supplied decision</legend>
          <p>
            Acceptance requires decision-recording authority. Enter the actual person and date supplied for
            this decision.
          </p>
          <TextInput
            id={`${record.id}-actor`}
            label="Decision maker"
            value={record.actor?.name ?? ''}
            onChange={(name) => update('actor', { kind: 'human', name, source: record.actor?.source ?? '' })}
          />
          <TextInput
            id={`${record.id}-decision-source`}
            label="Source of supplied decision"
            value={record.actor?.source ?? ''}
            onChange={(source) => update('actor', { kind: 'human', name: record.actor?.name ?? '', source })}
          />
          <SuppliedRecorder person={record.actor?.name ?? ''} source={record.actor?.source ?? ''} />
          <TextInput
            id={`${record.id}-date`}
            label="Decision date and time (ISO 8601)"
            value={record.decidedAt ?? ''}
            onChange={(v) => update('decidedAt', v)}
          />
        </fieldset>
      )}
      <details>
        <summary>Extension data</summary>
        <p>
          Extension semantics may be untested. RoboPomelo retains this data without claiming validation of an
          external adapter.
        </p>
        <pre>{JSON.stringify(record.extensions, null, 2)}</pre>
      </details>
      <button className="danger-link" type="button" onClick={() => setRemove(true)}>
        Remove record
      </button>
      {remove && (
        <Modal title={`Remove ${record.title}?`} onClose={() => setRemove(false)}>
          <p>This submits an explicit removal. Review history stays in the project.</p>
          {dependents.length > 0 && (
            <>
              <p>These records refer to this item. Edit their links before removing it.</p>
              <ul>
                {dependents.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => onView(d.id)}>
                      {d.title} ({d.collection})
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            disabled={dependents.length > 0}
            onClick={() => {
              edit({ op: 'remove', collection, id: record.id });
              setRemove(false);
            }}
          >
            Remove this record
          </button>
        </Modal>
      )}
    </div>
  );
}
