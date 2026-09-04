import { useEffect, useState, useSyncExternalStore } from 'react';
import { fields, questions } from '@robopomelo/spec/browser';
import { findingTarget, focusControl } from './lib/navigation.js';
import type { Finding, ProjectSnapshot, StepId } from '@robopomelo/spec';
import { api, errorMessage } from './lib/api.js';
import type { ProjectRead, Session } from './lib/api.js';
import { DraftController } from './lib/draft.js';
import { findRecord } from './lib/records.js';

import { Planning } from './screens/Planning.js';
import { Review } from './screens/Review.js';
import { Changes } from './screens/Changes.js';
import type { ProposalSummary } from './screens/Changes.js';
import { Evidence } from './screens/Evidence.js';
import { History } from './screens/History.js';
import { Settings } from './screens/Settings.js';
import type { TrustData } from './screens/Settings.js';
import { Findings } from './components/Findings.js';
import { Modal, ErrorNotice } from './components/ui.js';
import { AuthorContext } from './components/SuppliedRecorder.js';
import { ConflictDialog } from './components/ConflictDialog.js';
type Screen = StepId | 'review' | 'changes' | 'evidence' | 'history' | 'settings';
const sections: [Screen, string][] = [
  ['frame', 'Frame'],
  ['flow', 'Material flow'],
  ['success', 'Success'],
  ['requirements', 'Requirements'],
  ['acceptance', 'Acceptance'],
  ['review', 'Review & export'],
  ['changes', 'Changes'],
  ['evidence', 'Evidence'],
  ['history', 'History'],
  ['settings', 'Settings & updates'],
];
export function Workspace({ initial, onSwitch }: { initial: ProjectSnapshot; onSwitch: () => void }) {
  const [draft] = useState(
    () => new DraftController(initial, (patch, supersedes) => api.patch(patch, supersedes)),
  );
  const view = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const [screen, setScreen] = useState<Screen>('frame');
  const [nav, setNav] = useState(false);
  const [findings, setFindings] = useState(false);
  const [guard, setGuard] = useState<Screen | 'switch' | null>(null);
  const [parked, setParked] = useState<Screen | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [trust, setTrust] = useState<TrustData | null>(null);
  const [trustPanel, setTrustPanel] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [context, setContext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshTrust = async () => {
    const t = await api.request<TrustData>('/api/trust');
    setTrust(t);
  };
  useEffect(() => {
    void refreshTrust()
      .then(() => {})
      .catch((e) => setError(errorMessage(e)));
    return () => draft.dispose();
  }, [draft]);
  useEffect(() => {
    if (trust && !trust.effectiveScopes.includes('author')) setTrustPanel(true);
  }, [trust?.root]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (view.dirty || view.state === 'Saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [view.dirty, view.state]);
  const changeScreen = (next: Screen) => {
    setScreen(next);
    setNav(false);
    setRevealId(null);
    setTimeout(() => document.getElementById('section-heading')?.focus(), 0);
  };
  const navigate = async (next: Screen | 'switch') => {
    if (await draft.flush()) {
      if (next === 'switch') onSwitch();
      else changeScreen(next);
    } else setGuard(next);
  };
  const refresh = async () => {
    const result = await api.request<ProjectRead>('/api/project');
    if (result.kind !== 'readable')
      throw new Error('The external source is not readable. Preserve your draft and inspect the source.');
    if (view.dirty)
      throw new Error(
        'Unsaved local edits remain. Save or resolve them before refreshing the committed view.',
      );
    draft.replace(result.snapshot);
  };
  const settings = () => {
    setParked(screen);
    setGuard(null);
    setTrustPanel(false);
    changeScreen('settings');
  };
  const onView = (id: string, field?: string) => {
    const found = findRecord(view.deployment, id);
    if (!found) {
      setContext(
        `The target ${id} is unavailable in the current authoring source. Inspect the relevant historical revision for its original context.`,
      );
      return;
    }
    let destination: Screen = fields.find((f) => f.collection === found.collection)?.step ?? 'frame';
    if (['challenges', 'risks', 'assumptions'].includes(found.collection)) destination = 'flow';
    if (found.collection === 'decisions') destination = 'requirements';
    if (found.collection === 'evidence') destination = 'acceptance';
    if (found.collection === 'challengeAnswers' && 'promptId' in found.record)
      destination =
        questions.find((q) => q.id === ('promptId' in found.record ? found.record.promptId : ''))?.step ??
        'frame';
    void navigate(destination).then(() => {
      setRevealId(id);
      setTimeout(() => {
        const parent = document.getElementById(`record-${id}`);
        parent?.closest('details')?.setAttribute('open', '');
        const target = field
          ? (document.getElementById(`${id}-${field}`) ?? document.getElementById(`${id}-${field}-state`))
          : parent?.querySelector<HTMLElement>('input,select,textarea');
        target?.scrollIntoView({ block: 'center' });
        target?.focus();
      }, 100);
    });
  };
  const onFinding = (finding: Finding) => {
    setFindings(false);
    const target = findingTarget(view.deployment, finding);
    if (target.historical) {
      setContext(
        `The finding refers to historical or unavailable record ${target.historical}. Inspect its original revision in History.`,
      );
      return;
    }
    void navigate(target.screen).then(() => {
      setRevealId(target.recordId ?? target.questionId ?? null);
      setTimeout(() => focusControl(target.controlId), 100);
    });
  };
  const resume = (proposal: ProposalSummary) => {
    if (
      proposal.baseRevision !== view.committed.sourceRevision ||
      proposal.baseHash !== view.committed.sourceHash
    ) {
      setContext(
        'This proposal has a different committed base. Inspect and resolve its original diff before editing.',
      );
      return;
    }
    if (!proposal.patch) return;
    draft.loadProposal(proposal.patch, proposal.id);
    changeScreen('frame');
  };
  const navItems = (
    <nav aria-label="Project sections">
      {sections.map(([id, label], i) => (
        <button key={id} aria-current={screen === id ? 'page' : undefined} onClick={() => void navigate(id)}>
          {i < 5 && (
            <span className="nav-number" aria-hidden="true">
              {i + 1}
            </span>
          )}
          {label}
        </button>
      ))}
    </nav>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="navigation" aria-label="Project navigation">
        <div className="wordmark">
          <span className="pomelo-mark" aria-hidden="true">
            ◒
          </span>{' '}
          RoboPomelo
        </div>
        <p className="nav-caption">Your specification</p>
        {navItems}
        <button className="switch-project" onClick={() => void navigate('switch')}>
          Switch project
        </button>
        <p className="nav-footer">
          Local workspace
          <br />
          No robot control
        </p>
      </aside>
      <div className="workspace">
        <header className="project-header">
          <div>
            <p className="project-name">{view.deployment.project.name}</p>
            <div className="header-states">
              <span className={`status ${view.committed.validation.readiness}`}>
                {view.committed.validation.label}
              </span>
              <span>
                Operator decision:{' '}
                {view.committed.approvalStatus === 'stale'
                  ? 'Earlier decision needs review'
                  : view.committed.approvalStatus}
              </span>
            </div>
            <details className="revision-details">
              <summary>Revision {view.committed.sourceRevision} · Technical details</summary>
              <p>Source SHA-256: {view.committed.sourceHash}</p>
              <p>Planning SHA-256: {view.committed.planningHash}</p>
              {view.committed.approvalDetails.reasons.map((r, i) => (
                <p key={i}>{r.code.replaceAll('-', ' ')}</p>
              ))}
            </details>
          </div>
          <div className="header-actions">
            <span className="save-state" role="status">
              {view.state}
              {parked ? ' · Unsaved input parked' : ''}
            </span>
            <button className="mobile-nav" onClick={() => setNav(true)}>
              Project sections
            </button>
            <button className="findings-toggle" onClick={() => setFindings(true)}>
              Findings ({view.committed.validation.findings.length})
            </button>
          </div>
        </header>
        <div className="content-layout">
          <main id="main-content">
            <AuthorContext.Provider
              value={(actor) => {
                draft.setActor(actor);
                void draft.flush();
              }}
            >
              <ErrorNotice message={error ?? view.error} />
              {view.error && (
                <div className="actions">
                  <button onClick={() => void draft.flush()}>Retry save</button>
                  <button onClick={() => setConflict(true)}>Compare current source</button>
                  <button onClick={settings}>Open permission settings</button>
                  <button
                    onClick={() =>
                      void navigator.clipboard.writeText(draft.copy()).catch(() => setContext(draft.copy()))
                    }
                  >
                    Copy unsaved changes
                  </button>
                </div>
              )}
              {view.state === 'Proposed' && (
                <p className="notice subtle">
                  Changes are proposed against revision {view.committed.sourceRevision}.{' '}
                  <button onClick={() => void navigate('changes')}>Review proposal</button>
                </p>
              )}
              {['frame', 'flow', 'success', 'requirements', 'acceptance'].includes(screen) ? (
                <Planning
                  step={screen as StepId}
                  deployment={view.deployment}
                  edit={(operation) => draft.edit(operation)}
                  onView={onView}
                  revealId={revealId}
                />
              ) : screen === 'review' ? (
                <Review
                  snapshot={view.committed}
                  onView={onView}
                  onRefresh={refresh}
                  scopes={trust?.effectiveScopes ?? []}
                  onSettings={settings}
                />
              ) : screen === 'changes' ? (
                <Changes snapshot={view.committed} onRefresh={refresh} onResume={resume} />
              ) : screen === 'evidence' ? (
                <Evidence snapshot={view.committed} onRefresh={refresh} onView={onView} />
              ) : screen === 'history' ? (
                <History snapshot={view.committed} onRefresh={refresh} />
              ) : (
                <Settings
                  onTrustChange={refreshTrust}
                  parked={Boolean(parked)}
                  onReturn={() => {
                    const previous = parked;
                    setParked(null);
                    if (previous) changeScreen(previous);
                  }}
                />
              )}
            </AuthorContext.Provider>
          </main>
          <aside className="inspector" aria-label="Validation findings">
            <Findings report={view.committed.validation} onFinding={onFinding} />
          </aside>
        </div>
      </div>
      {nav && (
        <Modal title="Project sections" onClose={() => setNav(false)}>
          {navItems}
          <button onClick={() => void navigate('switch')}>Switch project</button>
        </Modal>
      )}
      {findings && (
        <Modal title="Document findings" onClose={() => setFindings(false)}>
          <Findings report={view.committed.validation} onFinding={onFinding} />
        </Modal>
      )}
      {guard && (
        <Modal title="Keep your unsaved work" onClose={() => setGuard(null)}>
          <p>The latest edits could not be saved. All current input is still available.</p>
          <div className="actions">
            <button onClick={() => setGuard(null)}>Stay here</button>
            <button
              onClick={() =>
                void draft.flush().then((ok) => {
                  if (ok) {
                    const next = guard;
                    setGuard(null);
                    if (next === 'switch') onSwitch();
                    else changeScreen(next);
                  }
                })
              }
            >
              Retry and continue
            </button>
            <button
              onClick={() =>
                void navigator.clipboard.writeText(draft.copy()).catch(() => setContext(draft.copy()))
              }
            >
              Copy unsaved changes
            </button>
            <button onClick={settings}>Park input and open Settings</button>
          </div>
        </Modal>
      )}
      {trustPanel && screen !== 'settings' && (
        <Modal title="Inspect or authorize this folder" onClose={() => setTrustPanel(false)}>
          <p>Selected folder: {trust?.root}</p>
          <p>
            Current scopes: {trust?.effectiveScopes.join(', ') || 'Inspection only'}. Mode: {trust?.mode}.
          </p>
          <p>
            Remembered authorization is local to this computer and lasts until forgotten. Project content
            cannot grant itself permission.
          </p>
          <div className="actions">
            <button onClick={() => setTrustPanel(false)}>Continue inspection only</button>
            <button className="primary" onClick={settings}>
              Choose editing scopes
            </button>
          </div>
        </Modal>
      )}
      {conflict && <ConflictDialog draft={draft} onClose={() => setConflict(false)} />}{' '}
      {context && (
        <Modal title="Record context" onClose={() => setContext(null)}>
          <pre>{context}</pre>
        </Modal>
      )}
    </div>
  );
}
