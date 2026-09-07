import { useRef, useState } from 'react';
import type { DesktopBridge, PickedAttachment } from '@robopomelo/spec';
import { api, errorMessage } from '../../lib/api.js';
import type { ProjectRead, Session } from '../../lib/api.js';
import { ErrorNotice } from '../../components/ui.js';
import type { IntakeState, SetIntake } from './state.js';
import { initialIntake } from './state.js';
import { Attachments } from './Attachments.js';
import './intake.css';
export function Intake({
  bridge,
  state,
  setState,
  onOpen,
}: {
  bridge: DesktopBridge;
  state: IntakeState;
  setState: SetIntake;
  onOpen: (read: ProjectRead) => void;
}) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<IntakeState>) => setState((current) => ({ ...current, ...patch }));
  const inspectionAllowed = state.mode === 'open' && !state.attachments.length && !state.description.trim();
  const parsing = state.attachments.some((file) => file.state === 'parsing');
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      const message = errorMessage(failure);
      if (message !== 'Setup confirmation cancelled') setError(message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function add(picked: PickedAttachment[]) {
    setState((current) => ({
      ...current,
      attachments: [
        ...current.attachments,
        ...picked
          .filter(
            (file) => !current.attachments.some((existing) => existing.selectionId === file.selectionId),
          )
          .map((file) => ({
            ...file,
            state: 'parsing' as const,
            textExcerpt: '',
            pagePreviewIds: [],
            warnings: [],
          })),
      ],
    }));
    void Promise.all(
      picked.map(async (file) => {
        try {
          const preview = await bridge.inspectAttachment(file.selectionId);
          setState((current) => ({
            ...current,
            attachments: current.attachments.map((item) =>
              item.selectionId === file.selectionId ? { ...item, ...preview } : item,
            ),
          }));
        } catch {
          setState((current) => ({
            ...current,
            attachments: current.attachments.map((item) =>
              item.selectionId === file.selectionId
                ? {
                    ...item,
                    state: 'failed',
                    warnings: ['Local reading failed. Try removing and selecting this file again.'],
                  }
                : item,
            ),
          }));
        }
      }),
    );
  }
  async function continueSetup() {
    if (!state.folder || parsing || (state.preset === 'inspection' && !inspectionAllowed)) return;
    const name =
      state.name.trim() || state.folder.displayPath.split('/').filter(Boolean).at(-1) || 'Deployment plan';
    await api.request('/api/intake/prepare', {
      name,
      seed: state.mode === 'example' ? 'inbound-pallet' : 'blank',
      description: state.preset === 'inspection' ? '' : state.description,
      attachmentIds: state.attachments.map((file) => file.selectionId),
    });
    await bridge.confirmSetup(state.folder.selectionId, state.preset);
    const session = await api.request<Session>('/api/session', undefined, false);
    api.setSession(session);
    const read = await api.request<ProjectRead>('/api/project');
    setState(initialIntake());
    onOpen(read);
  }
  return (
    <main className="desktop-intake" id="main-content">
      <header className="intake-header">
        <div className="wordmark">
          <span className="pomelo-mark" aria-hidden="true">
            ◒
          </span>{' '}
          RoboPomelo
        </div>
        <span className="intake-local">Local workspace</span>
      </header>
      <div className="intake-body">
        <div className="intake-intro">
          <p className="eyebrow">FROM OPERATING NEEDS TO A DEPLOYMENT PLAN</p>
          <h1>What should your robots help you do?</h1>
          <p className="lede">Start with what you know. Keep the unknowns visible.</p>
        </div>
        <div className="intake-modes" aria-label="Project setup">
          {(
            [
              ['create', 'Create a project'],
              ['open', 'Open a project'],
              ['example', 'Explore the example'],
            ] as const
          ).map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              disabled={busy}
              aria-pressed={state.mode === mode}
              onClick={() =>
                update({
                  mode,
                  preset: 'recommended',
                  ...((state.mode === 'open') !== (mode === 'open') ? { folder: null } : {}),
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
        <form
          className="intake-card"
          onSubmit={(event) => {
            event.preventDefault();
            void run(continueSetup);
          }}
        >
          {state.mode === 'example' && (
            <p className="intake-example">
              Explore a fictional inbound-pallet operation. The example is editable and needs no AI account.
            </p>
          )}
          <label className="intake-prompt-label" htmlFor="intake-prompt">
            What are you planning?
          </label>
          <textarea
            id="intake-prompt"
            rows={4}
            maxLength={16000}
            value={state.description}
            disabled={busy || state.preset === 'inspection'}
            onChange={(event) => update({ description: event.target.value })}
            placeholder="For example: move inbound pallets from receiving to storage. We have two shifts, narrow aisles, and a floor plan to work from."
            aria-describedby="intake-prompt-help"
          />
          <p id="intake-prompt-help" className="help">
            Describe the work, your site, or the problem to solve. You can also begin with files or a blank
            plan.
          </p>
          <Attachments
            files={state.attachments}
            disabled={busy || state.preset === 'inspection'}
            onSelect={() => void run(async () => add(await bridge.selectAttachments()))}
            onDrop={(files) => void run(async () => add(await bridge.dropAttachments(files)))}
            onRemove={(id) =>
              void run(async () => {
                await bridge.cancelAttachment(id);
                setState((current) => ({
                  ...current,
                  attachments: current.attachments.filter((file) => file.selectionId !== id),
                }));
              })
            }
          />
          <div className="intake-destination">
            <div>
              <label htmlFor="intake-name">
                Project name <span className="help">(optional)</span>
              </label>
              <input
                id="intake-name"
                maxLength={200}
                value={state.name}
                disabled={busy || state.preset === 'inspection'}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="Use the folder name"
              />
            </div>
            <div>
              <p className="intake-field-label">Project folder</p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const folder = await bridge.chooseProjectFolder(
                      state.mode === 'open' ? 'open' : 'create',
                    );
                    if (folder) update({ folder });
                  })
                }
              >
                {state.folder ? 'Change folder' : 'Choose project folder'}
              </button>
            </div>
          </div>
          {state.folder ? (
            <p className="intake-folder">{state.folder.displayPath}</p>
          ) : (
            <p className="help">
              {state.mode === 'open'
                ? 'Choose an existing RoboPomelo project.'
                : 'Choose or create a project folder in the native dialog.'}
            </p>
          )}
          <fieldset className="intake-permissions">
            <legend>Project access</legend>
            <label className="check-row">
              <input
                type="radio"
                name="preset"
                checked={state.preset === 'recommended'}
                disabled={busy}
                onChange={() => update({ preset: 'recommended' })}
              />
              Recommended <small>Read and save changes in this project folder.</small>
            </label>
            {state.mode === 'open' && (
              <>
                <label className="check-row">
                  <input
                    type="radio"
                    name="preset"
                    checked={state.preset === 'inspection'}
                    disabled={busy || !inspectionAllowed}
                    onChange={() => update({ preset: 'inspection' })}
                  />
                  Inspection only
                </label>
                {!inspectionAllowed && (
                  <p className="help">
                    Remove the selected files and clear the description to inspect without writing.
                  </p>
                )}
              </>
            )}
            <p className="help">
              Model connection and discovery come later. Continuing does not connect an AI account or send
              your files to a model.
            </p>
          </fieldset>
          <ErrorNotice message={error} />
          <div className="intake-submit">
            <span className="help">Your plan and original files stay in your project folder.</span>
            <button className="primary" disabled={busy || parsing || !state.folder}>
              {busy ? 'Working locally…' : 'Continue'}
            </button>
          </div>
        </form>
        <footer>Local files. Vendor-neutral planning. No robot control.</footer>
      </div>
    </main>
  );
}
