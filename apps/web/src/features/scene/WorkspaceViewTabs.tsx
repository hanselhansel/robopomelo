import './scene.css';
export type WorkspaceView = 'specification' | 'scene';
const TABS: [WorkspaceView, string][] = [['scene', 'Scene'], ['specification', 'Specification']];
/** Right-side view tabs from the approved workspace mockup. Switching views is
 * cosmetic: it never changes source, selection or camera state. */
export function WorkspaceViewTabs({ view, onChange }: { view: WorkspaceView; onChange: (view: WorkspaceView) => void }) {
  return (
    <div className="workspace-view-tabs" role="tablist" aria-label="Workspace view">
      {TABS.map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={view === id} aria-controls="main-content" onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
