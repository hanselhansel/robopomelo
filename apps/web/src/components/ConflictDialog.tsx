import { useState } from 'react';
import { fields } from '@robopomelo/spec/browser';
import type { ProjectSnapshot, PatchEnvelope, PatchEvaluation, Json } from '@robopomelo/spec';
import { api } from '../lib/api.js';
import { operationsBetween } from '../lib/draft.js';
import type { DraftController } from '../lib/draft.js';
import { conflictItems, resolveItems } from '../lib/conflicts.js';
import type { Resolution, ConflictItem } from '../lib/conflicts.js';
import { useAction } from '../lib/hooks.js';
import { Modal, ErrorNotice } from './ui.js';
import { DiffView } from './DocumentView.js';
import { Field } from './Field.js';
export function ConflictDialog({ draft, onClose }: { draft: DraftController; onClose: () => void }) {
  const [current, setCurrent] = useState<ProjectSnapshot | null>(null);
  const [patch, setPatch] = useState<PatchEnvelope | null>(null);
  const [preview, setPreview] = useState<PatchEvaluation | null>(null);
  const [choices, setChoices] = useState<Record<string, Resolution>>({});
  const [manual, setManual] = useState<string | null>(null);
  const action = useAction();
  const items = current
    ? conflictItems(draft.view.committed.deployment, current.deployment, draft.view.deployment)
    : [];
  const candidate = current ? resolveItems(current.deployment, items, choices) : null;
  const load = async () => {
    const result = await api.request<{ kind: string; snapshot?: ProjectSnapshot }>('/api/project');
    if (!result.snapshot)
      throw new Error(
        'The current source is not readable. Preserve the draft and inspect the source in History.',
      );
    setCurrent(result.snapshot);
    setPreview(null);
  };
  const choose = (key: string, resolution: Resolution) => {
    setChoices({ ...choices, [key]: resolution });
    setPreview(null);
  };
  const recreate = (item: ConflictItem) => {
    const op = item.operation;
    const choice = choices[item.key];
    if (op.op !== 'update') return;
    const old = draft.view.deployment[op.collection].find((r) => r.id === op.id);
    if (!old) return;
    const replacement = { ...old, id: crypto.randomUUID() };
    const next = { ...choices };
    for (const peer of items) {
      if (peer.operation.op === 'update' && peer.operation.id === op.id)
        next[peer.key] = { op: 'add', collection: op.collection, record: replacement as unknown as Json };
    }
    setChoices(next);
    setPreview(null);
  };
  const check = async () => {
    if (!current || !candidate) return;
    const proposal: PatchEnvelope = {
      formatVersion: '1.0.0',
      id: crypto.randomUUID(),
      projectId: current.deployment.project.id,
      baseRevision: current.sourceRevision,
      baseHash: current.sourceHash,
      actor: { kind: 'human', name: 'Local browser author' },
      purpose: 'Resolve retained local edits against current source',
      operations: operationsBetween(current.deployment, candidate),
    };
    setPatch(proposal);
    setPreview(await api.request<PatchEvaluation>('/api/patch/check', { patch: proposal }));
  };
  return (
    <Modal title="Resolve changes against the current source" onClose={onClose}>
      <p>
        Your original input remains in memory until an explicitly checked resolution succeeds. Independent
        local changes are retained automatically.
      </p>
      {!current ? (
        <button onClick={() => void action.run(load)}>Load current source for comparison</button>
      ) : (
        <>
          <p>
            Original base: {draft.view.committed.sourceRevision}
            <br />
            Current source: {current.sourceRevision}
          </p>
          {items
            .filter((i) => i.conflicting)
            .map((item) => {
              const op = item.operation;
              const choice = choices[item.key];
              const fieldName =
                op.op === 'project' || op.op === 'update' ? Object.keys(op.fields)[0] : undefined;
              const definition = fields.find(
                (f) =>
                  f.collection === (op.op === 'project' ? 'project' : op.collection) && f.path === fieldName,
              );
              return (
                <fieldset key={item.key}>
                  <legend>{definition?.label ?? item.key}</legend>
                  <div className="conflict-values">
                    <div>
                      <strong>Base</strong>
                      <pre>{JSON.stringify(item.base, null, 2)}</pre>
                    </div>
                    <div>
                      <strong>Current</strong>
                      <pre>
                        {item.deleted ? 'Record deleted remotely' : JSON.stringify(item.current, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <strong>Proposed</strong>
                      <pre>{JSON.stringify(item.proposed, null, 2)}</pre>
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      aria-pressed={choices[item.key] === 'current'}
                      onClick={() => choose(item.key, 'current')}
                    >
                      {item.deleted ? 'Accept deletion' : 'Use current'}
                    </button>
                    {item.deleted && op.op === 'update' ? (
                      <button onClick={() => recreate(item)}>Recreate as a new record</button>
                    ) : (
                      <button
                        aria-pressed={choices[item.key] === 'proposed'}
                        onClick={() => choose(item.key, 'proposed')}
                      >
                        Use proposed
                      </button>
                    )}
                    {definition && !item.deleted && (
                      <button onClick={() => setManual(item.key)}>Edit manually</button>
                    )}
                  </div>
                  {typeof choice === 'object' && choice.op === 'add' && (
                    <p>
                      A new stable ID will be allocated. Existing references are not silently remapped. Review
                      and explicitly update related reference fields in the checked diff.
                    </p>
                  )}
                  {manual === item.key &&
                    definition &&
                    candidate &&
                    (op.op === 'project' || op.op === 'update') && (
                      <Field
                        definition={definition}
                        id={`resolve-${item.key}`}
                        value={
                          typeof choice === 'object' && 'fields' in choice
                            ? (choice as { fields: Record<string, Json> }).fields[fieldName!]
                            : item.proposed
                        }
                        deployment={candidate}
                        onChange={(value) => choose(item.key, { ...op, fields: { [fieldName!]: value } })}
                      />
                    )}
                </fieldset>
              );
            })}
          {items.every((i) => !i.conflicting) && (
            <p>
              No competing field changes were detected. Your edits can be previewed against the current
              source.
            </p>
          )}
          <button
            disabled={items.some((i) => i.conflicting && !choices[i.key]) || action.busy}
            onClick={() => void action.run(check)}
          >
            Check resolution preview
          </button>
          {preview && patch && (
            <>
              <DiffView diff={preview.diff} />
              <p>{preview.validation.label}</p>
              <button
                className="primary"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    const result = await api.patch(patch);
                    if (result.kind === 'committed') {
                      draft.replace(result.snapshot);
                      onClose();
                    } else if (result.kind === 'proposal') {
                      draft.replace(current);
                      draft.loadProposal(patch, result.proposalId);
                      onClose();
                    } else
                      throw new Error(
                        'The source changed again. Your resolution and original draft remain available.',
                      );
                  })
                }
              >
                Apply checked resolution
              </button>
            </>
          )}
        </>
      )}
      <ErrorNotice message={action.error} />
    </Modal>
  );
}
