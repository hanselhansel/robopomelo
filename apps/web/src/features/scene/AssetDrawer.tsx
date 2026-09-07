import type { CatalogEntryView } from './actions.js';
import { defaultExtents } from './actions.js';
/** Reviewed catalog entries. Placing uses parameter defaults, marked as
 * assumptions, at the current view center. */
export function AssetDrawer({ entries, busy, onPlace, onClose }: { entries: CatalogEntryView[]; busy: boolean; onPlace: (entry: CatalogEntryView) => void; onClose: () => void }) {
  return (
    <section id="scene-asset-drawer" className="scene-drawer" aria-label="Asset catalog">
      <div className="scene-drawer-head">
        <p className="eyebrow">Add asset</p>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {entries.length === 0 && <p className="help">The catalog is still loading.</p>}
      <ul className="scene-catalog">
        {entries.map((entry) => {
          const size = defaultExtents(entry);
          return (
            <li key={`${entry.id}@${entry.version}`}>
              <button type="button" disabled={busy} onClick={() => onPlace(entry)}>
                <span className="scene-catalog-title">{entry.title}</span>
                <span className="scene-catalog-meta">{size.lengthM} x {size.widthM} x {size.heightM} m default, {entry.kind}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
