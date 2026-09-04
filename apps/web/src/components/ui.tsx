import { useEffect, useRef, useState, useId, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
export const ModalSuspensionContext = createContext(false);
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const suspended = useContext(ModalSuspensionContext);
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const d = ref.current;
    if (suspended) {
      if (d?.open && d.close) d.close();
      else d?.removeAttribute('open');
      return;
    }
    if (d?.showModal) d.showModal();
    else d?.setAttribute('open', '');
    d?.querySelector<HTMLElement>('h2')?.focus();
    return () => {
      if (d?.open && d.close) d.close();
      previous?.focus();
    };
  }, [suspended]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id={id} tabIndex={-1}>
          {title}
        </h2>
        <button aria-label="Close dialog" onClick={onClose}>
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ErrorNotice({ message }: { message: string | null }) {
  return message ? (
    <div className="notice error" role="alert">
      <strong>Action needs attention</strong>
      <p>{message}</p>
    </div>
  ) : null;
}
export function TextInput({
  id,
  label,
  value,
  onChange,
  multiline = false,
  help,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  help?: string;
  required?: boolean;
}) {
  const props = {
    id,
    value,
    required,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    'aria-describedby': help ? `${id}-help` : undefined,
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea {...props} rows={3} /> : <input {...props} />}{' '}
      {help && (
        <p className="help" id={`${id}-help`}>
          {help}
        </p>
      )}
    </div>
  );
}
export function StringList({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset id={id}>
      <legend>{label}</legend>
      {value.map((line, index) => (
        <div className="line-input" key={index}>
          <label className="visually-hidden" htmlFor={`${id}-${index}`}>
            {label} {index + 1}
          </label>
          <input
            id={`${id}-${index}`}
            value={line}
            onChange={(e) => onChange(value.map((v, i) => (i === index ? e.target.value : v)))}
          />
          <button
            type="button"
            aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            Remove
          </button>
          {index > 0 && (
            <button
              type="button"
              aria-label={`Move ${label.toLowerCase()} ${index + 1} up`}
              onClick={() => {
                const copy = [...value];
                [copy[index - 1], copy[index]] = [copy[index]!, copy[index - 1]!];
                onChange(copy);
              }}
            >
              ↑
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, ''])}>
        Add {label.toLowerCase()} item
      </button>
    </fieldset>
  );
}
export function PagedList<T>({
  items,
  label,
  searchText,
  children,
}: {
  items: readonly T[];
  label: string;
  searchText: (v: T) => string;
  children: (v: T) => ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const filtered = items.filter((v) => searchText(v).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const current = Math.min(page, Math.max(0, Math.ceil(filtered.length / 50) - 1));
  return (
    <div className="paged-list">
      <TextInput
        id={useId()}
        label={`Search ${label}`}
        value={query}
        onChange={(v) => {
          setQuery(v);
          setPage(0);
        }}
      />
      <p className="meta">
        {filtered.length} {label}
        {filtered.length > 50 ? `. Page ${current + 1} of ${Math.ceil(filtered.length / 50)}` : ''}
      </p>
      {filtered.slice(current * 50, current * 50 + 50).map(children)}
      {filtered.length > 50 && (
        <div className="actions">
          <button disabled={!current} onClick={() => setPage(current - 1)}>
            Previous page
          </button>
          <button disabled={(current + 1) * 50 >= filtered.length} onClick={() => setPage(current + 1)}>
            Next page
          </button>
        </div>
      )}
    </div>
  );
}
