import { useState } from 'react';
import type { IntakeAttachment } from './state.js';
import { Preview } from './Preview.js';
const labels = {
  parsing: 'Reading locally',
  parsed: 'Ready',
  partial: 'Partly understood',
  unsupported: 'Unsupported format',
  failed: 'Could not read',
};
export function Attachments({
  files,
  disabled,
  onSelect,
  onDrop,
  onRemove,
}: {
  files: IntakeAttachment[];
  disabled: boolean;
  onSelect: () => void;
  onDrop: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="intake-attachments">
      <div
        className={`intake-dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) onDrop(Array.from(event.dataTransfer.files));
        }}
      >
        <span className="intake-file-icon" aria-hidden="true">
          ＋
        </span>
        <div>
          <strong>Bring your floor plan or operating notes</strong>
          <p className="help">Drop files here, or choose them from your computer.</p>
        </div>
        <button type="button" onClick={onSelect} disabled={disabled}>
          Add files
        </button>
      </div>
      <p className="help">
        PDF, PNG and JPEG. Up to 20 files, 25 MB each and 100 MB total. Files are read locally.
      </p>
      {files.length > 0 && (
        <ul className="intake-files" aria-label="Selected files">
          {files.map((file) => (
            <li key={file.selectionId}>
              <div className="intake-file-heading">
                <div>
                  <strong>{file.name}</strong>
                  <small>{Math.ceil(file.bytes / 1024)} KB</small>
                </div>
                <span className={`intake-file-state ${file.state}`} role="status">
                  {labels[file.state]}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemove(file.selectionId)}
                  aria-label={`Remove ${file.name}`}
                >
                  Remove
                </button>
              </div>
              {file.warnings.map((warning, index) => (
                <p className="help" key={index}>
                  {warning}
                </p>
              ))}
              {(file.textExcerpt || file.pagePreviewIds.length > 0) && (
                <details>
                  <summary>Inspect local preview</summary>
                  {file.textExcerpt && <pre>{file.textExcerpt}</pre>}
                  <div className="intake-previews">
                    {file.pagePreviewIds.map((id) => (
                      <Preview key={id} id={id} name={file.name} />
                    ))}
                  </div>
                </details>
              )}
              {(file.state === 'partial' || file.state === 'unsupported' || file.state === 'failed') && (
                <p className="help">
                  The original stays attached. Add usable text or measurements above if needed.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
