import { useId, useState } from 'react';
import type { ConnectionModel } from '@robopomelo/spec';
import type { ModelInventory, Selection } from './types.js';
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export const effortLabel = (effort: string | null) => (effort ? titleCase(effort) : 'No effort');
/** Closed reading like "GPT-6 Astra · Medium · via OpenRouter". Two models with
 * one label under different connections stay distinct through the suffix. */
export function selectionText(selection: Selection | null, inventory: ModelInventory[]): string {
  if (!selection) return 'Choose a model';
  const group = inventory.find((item) => item.connection.connectionId === selection.connectionId);
  const model = group?.models.find((item) => item.modelId === selection.modelId);
  const modelLabel = model?.label ?? selection.label.replace(/ via .*$/, '');
  const connectionLabel = group?.connection.label ?? selection.label.replace(/^.* via /, '');
  return `${modelLabel} · ${effortLabel(selection.effort)} · via ${connectionLabel}`;
}
function ModelRow({
  model,
  connectionLabel,
  selection,
  busy,
  onSelect,
}: {
  model: ConnectionModel;
  connectionLabel: string;
  selection: Selection | null;
  busy: boolean;
  onSelect: (connectionId: string, modelId: string, effort: string | null) => Promise<boolean>;
}) {
  const current = selection?.connectionId === model.connectionId && selection.modelId === model.modelId;
  const [effort, setEffort] = useState<string | null>(current ? selection!.effort : (model.efforts[0] ?? null));
  const id = useId();
  const name = `${model.label} via ${connectionLabel}`;
  const supported = model.structuredActions;
  return (
    <fieldset className={`agent-model${current ? ' current' : ''}`} aria-describedby={supported ? undefined : `${id}-reason`}>
      <legend>{name}</legend>
      <p className="agent-model-id">
        <small>{model.modelId}</small>
        {current && <small className="agent-current">Current</small>}
      </p>
      <div className="agent-efforts" role="radiogroup" aria-label={`Effort for ${name}`}>
        {[...model.efforts, null].map((option) => (
          <label key={option ?? ''} className="agent-effort">
            <input
              type="radio"
              name={`${id}-effort`}
              value={option ?? ''}
              checked={effort === option}
              disabled={!supported || busy}
              onChange={() => setEffort(option)}
            />
            {effortLabel(option)}
          </label>
        ))}
      </div>
      {!supported && (
        <p className="help agent-reason" id={`${id}-reason`}>
          Cannot return structured planning actions
        </p>
      )}
      <button type="button" className={current ? '' : 'primary'} disabled={!supported || busy} aria-label={`Use ${name}`} onClick={() => void onSelect(model.connectionId, model.modelId, effort)}>
        {current ? 'Update effort' : 'Use this model'}
      </button>
    </fieldset>
  );
}
export function ModelSelector({
  inventory,
  selection,
  busy,
  canConnect,
  onSelect,
  onConnect,
  onDisconnect,
}: {
  inventory: ModelInventory[];
  selection: Selection | null;
  busy: boolean;
  /** False without a desktop bridge; the connect button stays visible with the reason. */
  canConnect: boolean;
  onSelect: (connectionId: string, modelId: string, effort: string | null) => Promise<boolean>;
  onConnect: (route: 'openrouter') => Promise<void>;
  onDisconnect: (connectionId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="agent-selector">
      <button type="button" className="agent-selector-toggle" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => setOpen((value) => !value)}>
        <span>{selectionText(selection, inventory)}</span>
        <span aria-hidden="true" className="agent-chevron">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="agent-selector-list" id={`${id}-list`}>
          {inventory.length === 0 && <p className="help">No connected accounts yet. Connect one to choose a model.</p>}
          {inventory.map(({ connection, models, error }) => (
            <section key={connection.connectionId} className="agent-connection" aria-label={`${connection.label} connection`}>
              <header className="agent-connection-heading">
                <div>
                  <strong>{connection.label}</strong> <small>via {connection.route}</small>
                </div>
                <button type="button" disabled={!canConnect || busy} aria-label={`Disconnect ${connection.label}`} onClick={() => void onDisconnect(connection.connectionId)}>
                  Disconnect
                </button>
              </header>
              {error && (
                <p className="help agent-connection-error">
                  Models unavailable: <code>{error}</code>
                </p>
              )}
              {!error && models.length === 0 && <p className="help">This connection offers no models right now.</p>}
              {models.map((model) => (
                <ModelRow key={model.modelId} model={model} connectionLabel={connection.label} selection={selection} busy={busy} onSelect={onSelect} />
              ))}
            </section>
          ))}
          <div className="agent-connect">
            <button type="button" disabled={!canConnect || busy} aria-describedby={canConnect ? undefined : `${id}-connect`} onClick={() => void onConnect('openrouter')}>
              Connect OpenRouter
            </button>
            {!canConnect && (
              <p className="help" id={`${id}-connect`}>
                Connecting an account needs the desktop app.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
