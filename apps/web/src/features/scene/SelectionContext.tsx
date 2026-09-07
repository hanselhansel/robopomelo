import { useSyncExternalStore } from 'react';
/** The selected scene object as a chip for the conversation composer. It is a
 * small external store so the composer and the scene panel need no shared
 * ancestor; it carries IDs and names only, never renderer objects. */
export type SelectedObject = { id: string; name: string };
let current: SelectedObject | null = null;
const listeners = new Set<() => void>();
export function publishSelection(next: SelectedObject | null): void {
  if (current?.id === next?.id && current?.name === next?.name) return;
  current = next;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useSelectedObject = (): SelectedObject | null => useSyncExternalStore(subscribe, () => current, () => current);
export function SelectedObjectChip({ onClear }: { onClear?: (() => void) | undefined }) {
  const selected = useSelectedObject();
  if (!selected) return null;
  return (
    <span className="scene-chip" data-instance-id={selected.id}>
      <span className="scene-chip-label">Selected object</span> {selected.name}
      {onClear && (
        <button type="button" className="scene-chip-clear" aria-label={`Clear selected object ${selected.name}`} onClick={onClear}>
          x
        </button>
      )}
    </span>
  );
}
