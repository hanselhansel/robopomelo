import type { ViewMode } from './scene-store.js';
/** View and edit controls. Camera actions never create spatial actions. */
export function SceneToolbar({ mode, canUndo, drawerOpen, busy, onView, onFit, onUndo, onToggleDrawer, onRefresh }: {
  mode: ViewMode; canUndo: boolean; drawerOpen: boolean; busy: boolean;
  onView: (mode: ViewMode) => void; onFit: () => void; onUndo: () => void; onToggleDrawer: () => void; onRefresh: () => void;
}) {
  return (
    <div className="scene-toolbar" role="toolbar" aria-label="Scene tools">
      <div className="scene-view-toggle" role="group" aria-label="View">
        <button type="button" aria-pressed={mode === '3d'} onClick={() => onView('3d')}>3D</button>
        <button type="button" aria-pressed={mode === 'top-down'} onClick={() => onView('top-down')}>Top-down</button>
      </div>
      <button type="button" onClick={onFit}>Fit layout</button>
      <button type="button" onClick={onUndo} disabled={!canUndo || busy}>Undo</button>
      <button type="button" onClick={onRefresh} disabled={busy}>Refresh scene</button>
      <button type="button" className="primary" aria-expanded={drawerOpen} aria-controls="scene-asset-drawer" onClick={onToggleDrawer}>Add asset</button>
    </div>
  );
}
