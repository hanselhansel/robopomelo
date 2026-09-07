import { useId, useState } from 'react';
import type { DesktopBridge, PickedAttachment } from '@robopomelo/spec';
import { errorMessage } from '../../lib/api.js';
/** Free text and attachments. Text survives any failed send; clearing happens
 * only after the server accepted the message. */
export function Composer({
  bridge,
  busy,
  disabledReason,
  onSend,
}: {
  bridge?: DesktopBridge | undefined;
  busy: boolean;
  /** When set, sending is unavailable and the reason is shown instead of hiding the button. */
  disabledReason?: string | null;
  onSend: (text: string, attachmentIds: string[]) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<PickedAttachment[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const id = useId();
  const empty = !text.trim() && files.length === 0;
  const blocked = busy || Boolean(disabledReason);
  const submit = async () => {
    if (empty || blocked) return;
    if (await onSend(text, files.map((file) => file.selectionId))) {
      setText('');
      setFiles([]);
    }
  };
  const attach = async () => {
    if (!bridge) return;
    setLocalError(null);
    try {
      const picked = await bridge.selectAttachments();
      setFiles((previous) => [...previous, ...picked.filter((file) => !previous.some((known) => known.selectionId === file.selectionId))]);
    } catch (cause) {
      setLocalError(errorMessage(cause));
    }
  };
  const help = disabledReason ?? (busy ? 'Waiting for the current turn to finish.' : 'Enter sends. Shift+Enter adds a line.');
  return (
    <div className="agent-composer">
      {files.length > 0 && (
        <ul className="agent-attachments" aria-label="Files to send">
          {files.map((file) => (
            <li key={file.selectionId}>
              <span>{file.name}</span>
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((previous) => previous.filter((item) => item.selectionId !== file.selectionId))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={`${id}-text`} className="visually-hidden">
        Ask anything about your plan
      </label>
      <textarea
        id={`${id}-text`}
        rows={2}
        value={text}
        placeholder="Ask anything..."
        aria-describedby={`${id}-help`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void submit();
        }}
      />
      <div className="agent-composer-actions">
        <button type="button" onClick={() => void attach()} disabled={!bridge || blocked} aria-describedby={bridge ? undefined : `${id}-attach`}>
          Attach files
        </button>
        {!bridge && (
          <span className="help" id={`${id}-attach`}>
            Attachments need the desktop app.
          </span>
        )}
        <button type="button" className="primary" disabled={empty || blocked} onClick={() => void submit()}>
          Send
        </button>
      </div>
      <p className="help" id={`${id}-help`}>
        {localError ?? help}
      </p>
    </div>
  );
}
