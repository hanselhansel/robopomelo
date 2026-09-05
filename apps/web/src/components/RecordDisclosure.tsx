import { useState, type ReactNode } from 'react';
/** Keep opened editors mounted so temporary input survives collapse; unopened rows stay cheap. */
export function RecordDisclosure({
  id,
  title,
  reveal,
  children,
}: {
  id: string;
  title: string;
  reveal: boolean;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(reveal);
  return (
    <details
      className="record"
      open={reveal || undefined}
      onToggle={(event) => {
        if (event.currentTarget.open) setVisited(true);
      }}
    >
      <summary>
        <span>{title}</span>
        <small>{id}</small>
      </summary>
      {(visited || reveal) && children}
    </details>
  );
}
