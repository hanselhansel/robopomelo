import { createContext, useContext, useState, useId } from 'react';
import type { Actor } from '@robopomelo/spec';
import { TextInput } from './ui.js';
export const AuthorContext = createContext<(actor: Actor) => void>(() => {});
export function SuppliedRecorder({ person, source }: { person: string; source: string }) {
  const id = useId();
  const [name, setName] = useState('');
  const [delegated, setDelegated] = useState(false);
  const record = useContext(AuthorContext);
  return (
    <fieldset className="supplied-recorder">
      <legend>Explicit recording action</legend>
      <TextInput id={id} label="Your name as recorder" value={name} onChange={setName} />
      {name !== person && (
        <label className="check-row">
          <input type="checkbox" checked={delegated} onChange={(e) => setDelegated(e.target.checked)} />I am
          recording the statement supplied by {person || 'the named person'} on their behalf.
        </label>
      )}
      <p className="help">
        Decision-recording authority is required. Enter the actual source and person above before recording.
      </p>
      <button
        type="button"
        disabled={!name.trim() || !person.trim() || !source.trim() || (name !== person && !delegated)}
        onClick={() =>
          record({ kind: 'human', name, source, ...(name !== person ? { onBehalfOf: person } : {}) })
        }
      >
        Record supplied statement with this attribution
      </button>
    </fieldset>
  );
}
