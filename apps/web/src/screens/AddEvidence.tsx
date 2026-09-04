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
import { hashFile } from '../lib/digest.js';
import { Modal, ErrorNotice, TextInput, PagedList } from '../components/ui.js';
import { KnowledgeField } from '../components/KnowledgeField.js';
import { References, referenceOptions } from '../components/References.js';
interface UploadBinding {
  uploadId: string;
  mutationId: string;
  digest: string;
}
export function AddEvidence({
  snapshot,
  onClose,
  onRefresh,
  onSettings,
}: {
  snapshot: ProjectSnapshot;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSettings: () => void;
}) {
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState<EvidenceRecord['purpose']>('planning');
  const [kind, setKind] = useState('attachment');
  const [reference, setReference] = useState('');
  const [provenance, setProvenance] = useState<Knowledge<string>>(null);
  const [relatedIds, setRelated] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [binding, setBinding] = useState<UploadBinding | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(true);
  const [outcomeKnown, setOutcomeKnown] = useState(false);
  const [mutationId] = useState(() => crypto.randomUUID());
  const action = useAction();
  const submit = async () => {
    const metadata = { title, purpose, provenance, relatedIds };
    if (kind !== 'attachment') {
      const result = await api.request<WriteResult>('/api/evidence/reference', {
        ...metadata,
        expected: expected(snapshot),
        mutationId,
        location:
          kind === 'external'
            ? { kind: 'external', uri: reference }
            : { kind: 'future', description: reference },
      });
      if (result.kind === 'proposal') {
        action.setNotice(`Evidence proposed as ${result.proposalId}. Open Changes to inspect and apply it.`);
        return;
      }
      if (result.kind === 'conflict')
        throw new Error('The source changed. The evidence declaration is retained.');
      await onRefresh();
      onClose();
      return;
    }
    if (!file) throw new Error('Select a local evidence file.');
    if (binding && !retryAllowed) throw new Error('Check the operation receipt before retrying this upload.');
    let upload = binding;
    if (!upload) {
      const sha256 = await hashFile(file, setProgress);
      upload = await api.request<UploadBinding>('/api/evidence/prepare', {
        ...metadata,
        expected: expected(snapshot),
        mutationId,
        file: { name: file.name, size: file.size, sha256 },
      });
      setBinding(upload);
    }
    setRetryAllowed(false);
    const response = await api.raw(
      `/api/evidence/uploads/${encodeURIComponent(upload.uploadId)}`,
      file,
      true,
      'PUT',
    );
    const result = (await response.json()) as {
      ok: boolean;
      data?: WriteResult;
      error?: { code: string; message: string };
    };
    if (!result.ok)
      throw new ApiError(
        result.error?.code ?? 'UPLOAD_FAILED',
        result.error?.message ?? 'Upload could not be committed.',
      );
    if (result.data?.kind === 'proposal') {
      setOutcomeKnown(true);
      action.setNotice(
        `Evidence proposed as ${result.data.proposalId}. Open Changes to inspect and apply it.`,
      );
      return;
    }
    if (result.data?.kind === 'conflict')
      throw new Error('The source changed. The selected file is retained.');
    if (result.data?.kind !== 'committed') {
      await checkReceipt();
      return;
    }
    await onRefresh();
    onClose();
  };
  const checkReceipt = async () => {
    if (!binding) return;
    const receipt = await api.request<MutationReceipt>(
      `/api/changes/${encodeURIComponent(binding.mutationId)}?digest=${binding.digest}`,
    );
    if (receipt.status === 'committed') {
      await onRefresh();
      onClose();
    } else if (receipt.status === 'proposed') {
      setOutcomeKnown(true);
      action.setNotice(
        `Evidence is proposed as ${receipt.proposalId}. Open Changes to inspect and apply it.`,
      );
    } else if ((receipt.status as string) === 'retired') {
      setOutcomeKnown(true);
      setRetryAllowed(false);
      action.setNotice(
        'This uncommitted evidence attempt was explicitly retired. Close this declaration and create a fresh one against the current source. The old mutation identity cannot be reused.',
      );
    } else if (receipt.status === 'not-found') {
      setRetryAllowed(true);
      action.setNotice('No committed receipt exists. Retry uses the same selected file and mutation key.');
    } else
      action.setNotice(
        receipt.status === 'indeterminate'
          ? receipt.reason
          : 'The evidence operation is still pending. Keep this dialog and selected file available.',
      );
  };
  return (
    <Modal
      title="Add evidence"
      onClose={() => {
        if (binding && !retryAllowed && !outcomeKnown)
          action.setNotice(
            'Keep this selected file available until its operation receipt is known. Check the receipt below.',
          );
        else onClose();
      }}
    >
      <fieldset disabled={Boolean(binding) || action.busy}>
        <TextInput id="evidence-title" label="Evidence title" value={title} onChange={setTitle} />
        <label htmlFor="add-evidence-purpose">Purpose</label>
        <select
          id="add-evidence-purpose"
          value={purpose}
          disabled={Boolean(binding)}
          onChange={(e) => setPurpose(e.target.value as EvidenceRecord['purpose'])}
        >
          <option value="planning">Planning source</option>
          <option value="acceptance-requirement">Future acceptance requirement</option>
          <option value="decision">Decision evidence</option>
        </select>
        <label htmlFor="add-evidence-kind">Location</label>
        <select
          id="add-evidence-kind"
          value={kind}
          disabled={Boolean(binding)}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="attachment">Selected local attachment</option>
          <option value="external">External reference</option>
          <option value="future">Future evidence</option>
        </select>
        {kind === 'attachment' ? (
          <div className="field">
            <label htmlFor="evidence-file">Local file</label>
            <input
              id="evidence-file"
              type="file"
              disabled={Boolean(binding)}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="help">
              Files are hashed in a stream and copied into this local project.{' '}
              {progress > 0 ? `${progress.toLocaleString()} bytes hashed.` : ''}
            </p>
          </div>
        ) : (
          <TextInput
            id="evidence-reference"
            label={kind === 'external' ? 'Reference URI' : 'Future evidence description'}
            value={reference}
            onChange={setReference}
          />
        )}
        <KnowledgeField
          id="evidence-provenance"
          label="Provenance"
          kind="text"
          value={provenance}
          onChange={setProvenance}
        />
        <References
          id="evidence-related"
          label="Related records"
          value={relatedIds}
          options={referenceOptions(snapshot.deployment, [
            'needs',
            'problems',
            'workflows',
            'requirements',
            'kpis',
            'acceptanceTests',
            'risks',
            'assumptions',
            'challenges',
            'decisions',
          ])}
          onChange={setRelated}
        />
      </fieldset>
      <ErrorNotice message={action.error} />
      {action.error && <button onClick={onSettings}>Open permission settings</button>}
      <p role="status">{action.notice}</p>
      <div className="actions">
        <button
          className="primary"
          disabled={
            action.busy ||
            (Boolean(binding) && !retryAllowed) ||
            !title.trim() ||
            (kind === 'attachment' ? !file : !reference.trim())
          }
          onClick={() => void action.run(submit)}
        >
          {action.busy ? 'Preparing evidence' : binding ? 'Retry identical upload' : 'Add evidence'}
        </button>
        {binding && (
          <button disabled={action.busy} onClick={() => void action.run(checkReceipt)}>
            Check operation receipt
          </button>
        )}
      </div>
    </Modal>
  );
}
