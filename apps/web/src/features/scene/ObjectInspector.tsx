import { useState, type KeyboardEvent } from 'react';
import type { Instance, Pose, RequirementBinding, Extents } from '@robopomelo/spec';
import type { SceneStore } from './scene-store.js';
import { degrees, radians } from './transforms.js';
type FieldKey = keyof Pose | keyof Extents;
type FieldSpec = { key: FieldKey; label: string; id: string; toDisplay: (v: number) => number; fromDisplay: (v: number) => number };
const identity = (v: number) => v;
export const FIRST_FIELD_ID = 'scene-field-x';
const POSE_FIELDS: FieldSpec[] = [
  { key: 'xM', label: 'X (m)', id: FIRST_FIELD_ID, toDisplay: identity, fromDisplay: identity },
  { key: 'yM', label: 'Y (m)', id: 'scene-field-y', toDisplay: identity, fromDisplay: identity },
  { key: 'yawRad', label: 'Rotation (deg)', id: 'scene-field-rotation', toDisplay: degrees, fromDisplay: radians },
];
const EXTENT_FIELDS: FieldSpec[] = [
  { key: 'lengthM', label: 'Length (m)', id: 'scene-field-length', toDisplay: identity, fromDisplay: identity },
  { key: 'widthM', label: 'Depth (m)', id: 'scene-field-depth', toDisplay: identity, fromDisplay: identity },
  { key: 'heightM', label: 'Height (m)', id: 'scene-field-height', toDisplay: identity, fromDisplay: identity },
];
export function dimensionLabel(instance: Instance, bindings: readonly RequirementBinding[]): 'Confirmed' | 'Assumed' | 'Unknown' | 'Stale' {
  if (bindings.some((b) => (b.subjectId === instance.id || b.target.recordId === instance.id) && b.target.field === 'instance.dimensions' && b.knowledgeState === 'stale')) return 'Stale';
  switch (instance.dimensions.state) {
    case 'known': return 'Confirmed';
    case 'unverified': return 'Assumed';
    default: return 'Unknown';
  }
}
/** Numeric controls covering every drag operation. Typing previews through the
 * same store as a drag; blur or Enter commits the same move/resize actions. */
export function ObjectInspector({ instance, title, store, bindings, busy, onCommit, onRemove }: {
  instance: Instance | null; title: string; store: SceneStore; bindings: readonly RequirementBinding[]; busy: boolean;
  onCommit: () => void; onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState<{ key: FieldKey; text: string } | null>(null);
  if (!instance) {
    return (
      <section className="scene-inspector" aria-label="Object inspector" role="region">
        <p className="eyebrow">Inspector</p>
        <p className="help">Select an object in the scene or the list to edit its position and size.</p>
      </section>
    );
  }
  const pose = store.effectivePose(instance.id), extents = store.effectiveExtents(instance.id);
  const value = (spec: FieldSpec): string => {
    if (editing?.key === spec.key) return editing.text;
    const raw = spec.key in pose ? pose[spec.key as keyof Pose] : extents?.[spec.key as keyof Extents];
    return raw === undefined ? '' : String(spec.toDisplay(raw));
  };
  const change = (spec: FieldSpec, text: string) => {
    setEditing({ key: spec.key, text });
    const parsed = Number(text);
    if (text.trim() === '' || !Number.isFinite(parsed)) return;
    if (store.beginPreview(instance.id)) store.updatePreview({ [spec.key]: spec.fromDisplay(parsed) });
  };
  const finish = () => { setEditing(null); onCommit(); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); finish(); }
    if (event.key === 'Escape') { setEditing(null); store.cancelPreview(); }
  };
  const field = (spec: FieldSpec, disabled = false) => (
    <label key={spec.id} className="scene-field">
      <span>{spec.label}</span>
      <input id={spec.id} type="number" inputMode="decimal" step={spec.key === 'yawRad' ? 5 : store.state.snap.positionM} value={value(spec)} disabled={disabled || busy} onChange={(e) => change(spec, e.target.value)} onBlur={finish} onKeyDown={onKeyDown} />
    </label>
  );
  const sources = instance.dimensions.state === 'known' || instance.dimensions.state === 'unverified' ? [...new Set([...instance.dimensions.sourceIds, ...instance.sourceIds])] : instance.sourceIds;
  const label = dimensionLabel(instance, bindings);
  return (
    <section className="scene-inspector" aria-label="Object inspector" role="region">
      <p className="eyebrow">Inspector</p>
      <h3 className="scene-inspector-title">{title}</h3>
      <p className="scene-inspector-id">{instance.id}</p>
      <div className="scene-fields">{POSE_FIELDS.map((spec) => field(spec))}</div>
      <div className="scene-dimensions-head">
        <span>Dimensions</span>
        <span className={`scene-state scene-state-${label.toLowerCase()}`}>{label}</span>
      </div>
      <div className="scene-fields">{EXTENT_FIELDS.map((spec) => field(spec, !extents))}</div>
      {!extents && <p className="help">{instance.dimensions.state === 'unknown' || instance.dimensions.state === 'not-applicable' ? instance.dimensions.reason : ''}</p>}
      <details className="scene-sources">
        <summary>Inspect source</summary>
        {sources.length ? <ul>{sources.map((id) => <li key={id}>{id}</li>)}</ul> : <p className="help">No source recorded. These values are assumptions until a source confirms them.</p>}
      </details>
      <button type="button" className="scene-remove" disabled={busy} onClick={() => onRemove(instance.id)}>Remove object</button>
    </section>
  );
}
