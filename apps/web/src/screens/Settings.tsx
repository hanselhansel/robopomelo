import { useEffect, useState } from 'react';
import type { Scope, Json } from '@robopomelo/spec';
import { api } from '../lib/api.js';
import { useResource, useAction } from '../lib/hooks.js';
import { TextInput, ErrorNotice, Modal } from '../components/ui.js';
export interface TrustData {
  root: string;
  grant: { scopes: Scope[]; mode: string } | null;
  effectiveScopes: Scope[];
  mode: 'autonomous' | 'review-each-change';
}
export interface UpdateStatus {
  mode: 'auto' | 'notify' | 'off';
  pin: string | null;
  offline: boolean;
  versions?: {
    launcherVersion: string;
    bundledRuntimeVersion: string;
    selectedRuntimeVersion: string;
    currentRuntimeVersion: string;
  };
  configuredOffline?: boolean;
  offlineForced?: boolean;
  availableVersion?: string | null;
  checkEligible?: boolean;
  rollbackVersion?: string | null;
  rollbackReason?: string;
  sourceCheckout?: boolean;
  launcherVersion?: string;
  bundledVersion?: string;
  selectedVersion?: string;
  currentVersion?: string;
  installedVersion?: string;
  pendingVersion?: string | null;
  rollbackEligible?: boolean;
  installEligible?: boolean;
  compatibility?: string;
  lastOutcome?: Json;
  rollbackHold?: Json;
}
const scopeLabels: Record<Scope, string> = {
  inspect: 'Inspect the project',
  author: 'Edit planning records',
  evidence: 'Add and manage evidence',
  export: 'Export handoff packages',
  'record-decisions': 'Record supplied decisions and protected obligations',
  'manage-settings': 'Manage local application settings',
};
export function Settings({
  onTrustChange,
  onReturn,
  parked = false,
}: {
  onTrustChange: () => Promise<void>;
  onReturn?: () => void;
  parked?: boolean;
}) {
  const trust = useResource<TrustData>('/api/trust');
  const updates = useResource<UpdateStatus>('/api/updates');
  const [scopes, setScopes] = useState<Scope[]>(['inspect', 'author', 'evidence', 'export']);
  const [mode, setMode] = useState('autonomous');
  const [remember, setRemember] = useState(true);
  const [updateMode, setUpdateMode] = useState('auto');
  const [pin, setPin] = useState('');
  const [offline, setOffline] = useState(false);
  const [forget, setForget] = useState(false);
  const action = useAction();
  useEffect(() => {
    if (trust.data) {
      setScopes(trust.data.effectiveScopes.length ? trust.data.effectiveScopes : ['inspect']);
      setMode(trust.data.mode);
    }
  }, [trust.data]);
  useEffect(() => {
    if (updates.data) {
      setUpdateMode(updates.data.mode);
      setPin(updates.data.pin ?? '');
      setOffline(updates.data.configuredOffline ?? updates.data.offline);
    }
  }, [updates.data]);
  const updateAction = (name: string) =>
    void action.run(async () => {
      const version =
        name === 'install'
          ? updates.data?.availableVersion
          : name === 'rollback'
            ? updates.data?.rollbackVersion
            : null;
      const outcome = await api.request<Json>(`/api/updates/${name}`, version ? { version } : {});
      action.setNotice(
        outcome &&
          typeof outcome === 'object' &&
          !Array.isArray(outcome) &&
          typeof outcome.message === 'string'
          ? outcome.message
          : `Update operation returned: ${JSON.stringify(outcome)}`,
      );
      await updates.reload();
    });
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">Local authority and runtime</p>
        <h1 id="settings-heading" tabIndex={-1}>
          Settings &amp; updates
        </h1>
        <p className="lede">Project trust and application updates have separate controls.</p>
      </div>
      {parked && (
        <div className="notice warning">
          <strong>Unsaved editor input is parked in memory.</strong>
          <p>
            Return to the editor after changing authority. Its original source base will be checked before
            saving.
          </p>
          {onReturn && <button onClick={onReturn}>Return to unsaved editor</button>}
        </div>
      )}
      <ErrorNotice message={trust.error ?? updates.error ?? action.error} />
      <section>
        <h2>Project trust</h2>
        <p className="break-anywhere">
          Selected folder: <strong>{trust.data?.root ?? api.session?.root ?? 'Loading selected root'}</strong>
        </p>
        <p>
          Only the scopes selected here are authorized. Remembered trust belongs to this computer and lasts
          until revoked or forgotten.
        </p>
        <fieldset>
          <legend>Explicit editing scopes</legend>
          {(Object.keys(scopeLabels) as Scope[]).map((scope) => (
            <label className="check-row" key={scope}>
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                disabled={scope === 'inspect'}
                onChange={(e) =>
                  setScopes(e.target.checked ? [...scopes, scope] : scopes.filter((s) => s !== scope))
                }
              />
              {scopeLabels[scope]}
            </label>
          ))}
        </fieldset>
        <label htmlFor="trust-mode">Change mode</label>
        <select id="trust-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="autonomous">Autonomous (recommended): commit authorized edits</option>
          <option value="review-each-change">Review each change: retain proposals until applied</option>
        </select>
        <label className="check-row">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember this folder until forgotten
        </label>
        <div className="actions">
          <button
            className="primary"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api.request('/api/trust', {
                  action: 'grant',
                  scopes: [...new Set<Scope>(['inspect', ...scopes])],
                  mode,
                  remember,
                });
                await trust.reload();
                await onTrustChange();
                action.setNotice('Selected project authority updated.');
              })
            }
          >
            Authorize selected scopes
          </button>
          <button
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api.request('/api/trust', { action: 'revoke' });
                await trust.reload();
                await onTrustChange();
                action.setNotice('Editing authority revoked. Inspection remains available.');
              })
            }
          >
            Revoke editing authority
          </button>
          <button onClick={() => setForget(true)}>Forget project</button>
        </div>
      </section>
      <section>
        <h2>Application runtime</h2>
        {updates.data && (
          <>
            <dl className="runtime-details">
              <div>
                <dt>Current session runtime</dt>
                <dd>
                  {updates.data.versions?.currentRuntimeVersion ??
                    updates.data.currentVersion ??
                    api.session?.toolVersion ??
                    'Not reported'}
                </dd>
              </div>
              <div>
                <dt>Installed runtime</dt>
                <dd>
                  {updates.data.versions?.selectedRuntimeVersion ??
                    updates.data.installedVersion ??
                    updates.data.selectedVersion ??
                    'Not reported'}
                </dd>
              </div>
              <div>
                <dt>Pending runtime</dt>
                <dd>{updates.data.pendingVersion ?? 'None reported'}</dd>
              </div>
              <div>
                <dt>Compatibility</dt>
                <dd>{updates.data.compatibility ?? 'No compatibility result reported'}</dd>
              </div>
            </dl>
            {updates.data.availableVersion && (
              <p>
                Available stable version: {updates.data.availableVersion}. Installation still checks publisher
                provenance and compatibility.
              </p>
            )}
            <p>Staging an update does not replace the code in this active session.</p>
            <label htmlFor="update-mode">Update policy</label>
            <select id="update-mode" value={updateMode} onChange={(e) => setUpdateMode(e.target.value)}>
              <option value="auto">Automatic compatible stable updates</option>
              <option value="notify">Notify only</option>
              <option value="off">Off</option>
            </select>
            <TextInput
              id="update-pin"
              label="Exact stable version pin (optional)"
              value={pin}
              onChange={setPin}
            />
            <label className="check-row">
              <input
                type="checkbox"
                aria-describedby="offline-preference-help"
                checked={offline}
                onChange={(e) => setOffline(e.target.checked)}
              />
              Offline mode
            </label>
            <p className="help" id="offline-preference-help">
              Save the default offline preference.{' '}
              {updates.data.offlineForced
                ? 'This launch remains offline because it was started with --offline.'
                : 'The running session also honors the saved preference.'}
            </p>
            {updates.data.sourceCheckout && (
              <p className="notice subtle">This source checkout does not manage installed runtimes.</p>
            )}
            {updates.data.offline && (
              <p className="notice subtle">
                Offline mode is active. Network update checks are unavailable; project navigation remains
                available.
              </p>
            )}
            <div className="actions">
              <button
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await api.request('/api/updates/configure', {
                      mode: updateMode,
                      pin: pin || null,
                      offline,
                    });
                    await updates.reload();
                    action.setNotice('Update policy saved.');
                  })
                }
              >
                Save update policy
              </button>
              <button
                disabled={action.busy || updates.data.offline || updates.data.checkEligible === false}
                onClick={() => updateAction('check')}
              >
                Check for updates
              </button>
              <button
                disabled={action.busy || updates.data.offline || updates.data.installEligible === false}
                onClick={() => updateAction('install')}
              >
                Install eligible update
              </button>
              <button
                disabled={action.busy || updates.data.rollbackEligible === false}
                onClick={() => updateAction('rollback')}
              >
                Roll back runtime
              </button>
            </div>
            {updates.data.rollbackReason && <p className="help">{updates.data.rollbackReason}</p>}
            {updates.data.rollbackHold && (
              <div className="notice subtle">
                <p>A rollback hold is active. Resume normal selection explicitly when you are ready.</p>
                <button
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await api.request('/api/updates/configure', { resume: true });
                      await updates.reload();
                      action.setNotice('Normal update selection resumed.');
                    })
                  }
                >
                  Resume normal update selection
                </button>
              </div>
            )}
            <details>
              <summary>Last update outcome and runtime identities</summary>
              <pre>{JSON.stringify(updates.data, null, 2)}</pre>
            </details>
          </>
        )}
      </section>
      <p role="status">{action.notice}</p>
      {forget && (
        <Modal title="Forget this project’s trust?" onClose={() => setForget(false)}>
          <p>
            This removes remembered authority for this folder. Project files, evidence and revision history
            remain on disk.
          </p>
          <button
            onClick={() =>
              void action.run(async () => {
                await api.request('/api/trust', { action: 'forget' });
                await trust.reload();
                await onTrustChange();
                setForget(false);
                action.setNotice('Remembered project authority removed.');
              })
            }
          >
            Forget remembered trust
          </button>
          <ErrorNotice message={action.error} />
        </Modal>
      )}
    </>
  );
}
