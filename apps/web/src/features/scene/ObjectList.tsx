import type { Instance } from '@robopomelo/spec';
/** Focusable list mirroring scene ids and asset names. Focus follows selection
 * so Tab reaches every row; arrows are reserved for nudging the selection. */
export function ObjectList({ instances, selectedId, title, onSelect }: {
  instances: Instance[]; selectedId: string | null; title: (assetId: string) => string; onSelect: (id: string) => void;
}) {
  return (
    <ul className="scene-object-list" role="listbox" aria-label="Objects">
      {instances.length === 0 && <li className="scene-empty">No objects yet. Use Add asset to place one.</li>}
      {instances.map((instance) => (
        <li
          key={instance.id}
          role="option"
          tabIndex={0}
          aria-selected={selectedId === instance.id}
          className={`scene-row${selectedId === instance.id ? ' selected' : ''}`}
          onClick={() => onSelect(instance.id)}
          onFocus={() => onSelect(instance.id)}
        >
          <span className="scene-row-name">{title(instance.asset.id)}</span>
          <span className="scene-row-id">{instance.id}</span>
        </li>
      ))}
    </ul>
  );
}
