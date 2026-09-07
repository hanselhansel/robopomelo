import { useId, useState } from 'react';
import type { AssetRef, SpatialAction } from '@robopomelo/spec';
import type { DraftKind, DraftStatus, Finding } from '@robopomelo/spatial';
import './asset-draft.css';
/** Props-driven draft editor. Validation, promotion and upgrade application
 * happen in the owning hook; this view only makes the lifecycle legible:
 * a failing draft stays visibly incomplete and Promote explains why it waits. */
export type AssetDraftView = { id: string; kind: DraftKind; version: string | null; status: DraftStatus; validation: { ok: boolean; findings: Finding[] }; promotedTo: AssetRef | null };
export type ParameterChangeView =
  | { name: string; change: 'added'; to: { minimum: number; maximum: number } }
  | { name: string; change: 'removed'; from: { minimum: number; maximum: number } }
  | { name: string; change: 'bounds-changed'; from: { minimum: number; maximum: number }; to: { minimum: number; maximum: number } };
export type UpgradePreviewView = {
  from: AssetRef; to: AssetRef; direction: 'upgrade' | 'downgrade'; flagged: boolean;
  parameterChanges: ParameterChangeView[]; affectedInstanceIds: string[]; resizedInstanceIds: string[]; actions: SpatialAction[];
};
const SEMVER = /^\d+\.\d+\.\d+$/;
const STATUS_TEXT: Record<DraftStatus, string> = { draft: 'Draft', validated: 'Validated', 'reusable-version': 'Reusable version' };
const changeText = (c: ParameterChangeView): string =>
  c.change === 'added' ? `${c.name}: added, ${c.to.minimum} to ${c.to.maximum}` : c.change === 'removed' ? `${c.name}: removed` : `${c.name}: bounds ${c.from.minimum} to ${c.from.maximum} become ${c.to.minimum} to ${c.to.maximum}`;
export function AssetDraft({ draft, preview, busy, onValidate, onPromote, onApplyUpgrade }: {
  draft: AssetDraftView;
  preview: UpgradePreviewView | null;
  busy: boolean;
  onValidate: () => Promise<void>;
  onPromote: (version: string) => Promise<void>;
  onApplyUpgrade: (preview: UpgradePreviewView) => Promise<void>;
}) {
  const id = useId();
  const [version, setVersion] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const validated = draft.status === 'validated' && draft.validation.ok;
  const promoted = draft.status === 'reusable-version';
  const versionOk = SEMVER.test(version);
  const promoteReason = !validated ? 'Validate the draft before promoting it.' : !versionOk ? 'Enter a version like 1.0.0 to promote.' : null;
  const applyKey = preview ? `${preview.from.version}->${preview.to.version}` : null;
  return (
    <section className="asset-draft" aria-labelledby={`${id}-title`}>
      <div className="asset-draft-head">
        <p className="eyebrow" id={`${id}-title`}>Asset draft</p>
        <span className="asset-draft-kind">{draft.kind}</span>
        <span className={`asset-draft-status ${draft.status}`}>{promoted && draft.version ? `Reusable version ${draft.version}` : STATUS_TEXT[draft.status]}</span>
      </div>
      <p className="asset-draft-id">{draft.id}</p>
      {draft.validation.findings.length > 0 && (
        <ul className="asset-draft-findings" aria-label="Validation findings">
          {draft.validation.findings.map((finding, i) => (
            <li key={`${finding.code}-${i}`}>
              <code>{finding.code}</code> <span>{finding.message}</span>
            </li>
          ))}
        </ul>
      )}
      {!promoted && (
        <div className="asset-draft-actions">
          <button type="button" disabled={busy} onClick={() => void onValidate()}>Validate</button>
          <label htmlFor={`${id}-version`}>Version</label>
          <input id={`${id}-version`} value={version} placeholder="1.0.0" disabled={busy || !validated} aria-describedby={`${id}-reason`} onChange={(event) => setVersion(event.target.value.trim())} />
          <button type="button" className="primary" disabled={busy || promoteReason !== null} onClick={() => void onPromote(version)}>Promote</button>
          <p className="help" id={`${id}-reason`}>{promoteReason ?? 'Promotion writes an immutable library version; existing instances stay pinned.'}</p>
        </div>
      )}
      {promoted && draft.promotedTo && <p className="help">Content hash {draft.promotedTo.sha256.slice(0, 12)}. This version never changes; edit as a new draft to publish another.</p>}
      {preview && (
        <div className={`asset-draft-preview${preview.flagged ? ' flagged' : ''}`}>
          <p className="asset-draft-preview-title">{preview.direction === 'upgrade' ? 'Upgrade' : 'Downgrade'} {preview.from.version} to {preview.to.version}</p>
          {preview.flagged && <p className="asset-draft-flag">This moves instances to an older version. Check the parameter changes before applying.</p>}
          {preview.parameterChanges.length > 0 && (
            <ul className="asset-draft-changes" aria-label="Parameter changes">
              {preview.parameterChanges.map((change) => <li key={change.name}>{changeText(change)}</li>)}
            </ul>
          )}
          <p className="help">{preview.affectedInstanceIds.length} affected instance{preview.affectedInstanceIds.length === 1 ? '' : 's'}. Other instances keep their pinned version.</p>
          <ul className="asset-draft-instances" aria-label="Affected instances">
            {preview.affectedInstanceIds.map((instanceId) => (
              <li key={instanceId}>{instanceId}{preview.resizedInstanceIds.includes(instanceId) ? ' (resized to the new bounds)' : ''}</li>
            ))}
          </ul>
          <button
            type="button"
            className="primary"
            disabled={busy || preview.affectedInstanceIds.length === 0 || applied === applyKey}
            onClick={() => { setApplied(applyKey); void onApplyUpgrade(preview); }}
          >
            Apply upgrade to {preview.affectedInstanceIds.length} instance{preview.affectedInstanceIds.length === 1 ? '' : 's'}
          </button>
          <p className="help">Applying creates a new source revision with the listed changes.</p>
        </div>
      )}
    </section>
  );
}
