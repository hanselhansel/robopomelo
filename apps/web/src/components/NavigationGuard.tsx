import { useState } from 'react';
import { Modal } from './ui.js';
export function NavigationGuard({
  unsaved,
  onStay,
  onRetry,
  onCopy,
  onSettings,
  onDiscard,
}: {
  unsaved: string;
  onStay: () => void;
  onRetry: () => void;
  onCopy: () => void;
  onSettings: () => void;
  onDiscard: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal title={confirm ? 'Discard this local input?' : 'Keep your unsaved work'} onClose={onStay}>
      {confirm ? (
        <>
          <p>
            This discards the retained browser input shown below. It does not delete source files, evidence or
            revision history. An operation with an unknown outcome may still exist on disk.
          </p>
          <pre>{unsaved}</pre>
          <div className="actions">
            <button onClick={() => setConfirm(false)}>Keep local input</button>
            <button onClick={onCopy}>Copy before discarding</button>
            <button onClick={onDiscard}>Discard this local buffer and continue</button>
          </div>
        </>
      ) : (
        <>
          <p>The latest edits could not be saved. All current input is still available.</p>
          <div className="actions">
            <button onClick={onStay}>Stay here</button>
            <button onClick={onRetry}>Retry and continue</button>
            <button onClick={onCopy}>Copy unsaved changes</button>
            <button onClick={onSettings}>Park input and open Settings</button>
            <button onClick={() => setConfirm(true)}>Review local input to discard</button>
          </div>
        </>
      )}
    </Modal>
  );
}
