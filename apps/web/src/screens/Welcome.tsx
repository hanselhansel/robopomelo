import { useState } from 'react';
import { api } from '../lib/api.js';
import type { ProjectRead } from '../lib/api.js';
import { useAction } from '../lib/hooks.js';
import { ErrorNotice, TextInput } from '../components/ui.js';
export function Welcome({ onOpen }: { onOpen: (read: ProjectRead) => void }) {
  const [mode, setMode] = useState<'create' | 'open' | 'example'>('create');
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const action = useAction();
  return (
    <main className="welcome" id="main-content">
      <div className="wordmark">
        <span className="pomelo-mark" aria-hidden="true">
          ◒
        </span>{' '}
        RoboPomelo
      </div>
      <div className="welcome-intro">
        <p className="eyebrow">A local workspace for deployment planning</p>
        <h1>
          Start with the work.
          <br />
          Design the deployment.
        </h1>
        <p className="lede">
          Turn operational needs, material flows and open questions into a reviewable AMR specification.
        </p>
      </div>
      <div className="welcome-choices">
        {(
          [
            ['create', 'Create a project', 'Begin a new specification.'],
            ['open', 'Open a project', 'Continue from a local folder.'],
            ['example', 'Explore the example', 'Create a fictional inbound-pallet project.'],
          ] as const
        ).map(([id, title, description]) => (
          <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>
            <strong>{title}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>
      <form
        className="welcome-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () =>
            onOpen(await api.open(path, mode === 'open' ? undefined : name, mode === 'example')),
          );
        }}
      >
        <h2>
          {mode === 'open'
            ? 'Open a local folder'
            : mode === 'example'
              ? 'Create the fictional example'
              : 'Create your planning folder'}
        </h2>
        <p>Choose the exact folder path. Project files stay on this computer.</p>
        <TextInput
          id="project-path"
          label="Absolute folder path"
          value={path}
          onChange={setPath}
          required
          help="Use an existing project folder to open, or an empty/new folder to create."
        />
        {mode !== 'open' && (
          <TextInput id="project-name" label="Project name" value={name} onChange={setName} required />
        )}
        <ErrorNotice message={action.error} />
        <button
          className="primary"
          disabled={action.busy || !path.trim() || (mode !== 'open' && !name.trim())}
        >
          {action.busy
            ? 'Opening project'
            : mode === 'open'
              ? 'Open project'
              : mode === 'example'
                ? 'Create example project'
                : 'Create project'}
        </button>
      </form>
      <footer>Local files. Vendor-neutral planning. No robot control.</footer>
    </main>
  );
}
