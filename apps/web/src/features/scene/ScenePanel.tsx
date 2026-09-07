import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ErrorNotice } from '../../components/ui.js';
import { useScene } from './useScene.js';
import { SceneCanvas, type CreateRenderer } from './SceneCanvas.js';
import { SceneToolbar } from './SceneToolbar.js';
import { ObjectList } from './ObjectList.js';
import { ObjectInspector, FIRST_FIELD_ID } from './ObjectInspector.js';
import { AssetDrawer } from './AssetDrawer.js';
import { publishSelection } from './SelectionContext.js';
import { SimulationPanel } from '../simulation/SimulationPanel.js';
import './scene.css';
const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
const isTextTarget = (target: EventTarget | null) => target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
/** Scene editor: toolbar, canvas, object list, inspector and asset drawer.
 * Focus order is toolbar, object list, inspector. The live region reports
 * committed outcomes only. */
export function ScenePanel({ createRenderer }: { createRenderer?: CreateRenderer | undefined }) {
  const scene = useScene();
  const { store, state } = scene;
  const [drawer, setDrawer] = useState(false);
  const [simulation, setSimulation] = useState(false);
  const fitRef = useRef<(() => void) | null>(null);
  const title = (assetId: string) => scene.catalog.find((e) => e.id === assetId)?.title ?? assetId;
  const selected = store.instance(state.selectedId);
  useEffect(() => {
    publishSelection(selected ? { id: selected.id, name: `${title(selected.asset.id)} ${selected.id}` } : null);
    return () => publishSelection(null);
  }, [selected?.id, scene.catalog]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { store.cancelPreview(); return; }
    if (isTextTarget(event.target)) return;
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      store.nudge(arrow[0], arrow[1], event.shiftKey);
    } else if (event.key === 'Enter' && state.selectedId) {
      event.preventDefault();
      document.getElementById(FIRST_FIELD_ID)?.focus();
    }
  };
  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (ARROWS[event.key] && !isTextTarget(event.target) && store.state.preview) void scene.commitPreview();
  };
  const notice = scene.conflict?.message ?? scene.error;
  return (
    <section className="scene-panel" aria-label="Scene editor">
      <SceneToolbar
        mode={state.camera.mode}
        canUndo={state.undo.length > 0}
        drawerOpen={drawer}
        busy={scene.busy}
        onView={(mode) => store.setView(mode)}
        onFit={() => fitRef.current?.()}
        onUndo={() => void scene.undo()}
        onToggleDrawer={() => setDrawer((open) => !open)}
        onRefresh={() => void scene.reload()}
      />
      <ErrorNotice message={notice} />
      {scene.conflict?.pending && (
        <div className="actions scene-conflict-actions">
          <button type="button" onClick={() => void scene.retryPending()}>Retry pending change</button>
          <button type="button" onClick={scene.discardPending}>Discard pending change</button>
        </div>
      )}
      {!scene.loading && !scene.hasScene && (
        <div className="scene-empty-state">
          <p className="eyebrow">No scene yet</p>
          <p>Create the first scene to start placing walls, racks, stations and robots. Placement uses catalog defaults marked as assumptions until a source confirms them.</p>
          <button type="button" className="primary" disabled={scene.busy} onClick={() => void scene.createScene()}>Create scene</button>
        </div>
      )}
      {scene.hasScene && (
        <div className="scene-body">
          <div className="scene-edit" role="group" aria-label="Scene objects" onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
            <SceneCanvas scene={scene} fitRef={fitRef} {...(createRenderer ? { createRenderer } : {})} />
            <div className="scene-list-column">
              <p className="eyebrow">{state.scene?.name ?? 'Scene'}</p>
              <ObjectList instances={state.scene?.instances ?? []} selectedId={state.selectedId} title={title} onSelect={(id) => store.select(id)} />
            </div>
          </div>
          <div className="scene-side">
            <ObjectInspector
              instance={selected}
              title={selected ? title(selected.asset.id) : ''}
              store={store}
              bindings={state.bindings}
              busy={scene.busy}
              onCommit={() => void scene.commitPreview()}
              onRemove={(id) => void scene.remove(id)}
            />
            {drawer && <AssetDrawer entries={scene.catalog} busy={scene.busy} onPlace={(entry) => void scene.place(entry)} onClose={() => setDrawer(false)} />}
          </div>
        </div>
      )}
      {scene.hasScene && (
        <details className="scene-simulation" onToggle={(event) => setSimulation(event.currentTarget.open)}>
          <summary>Fleet simulation</summary>
          {simulation && <SimulationPanel />}
        </details>
      )}
      <p className="visually-hidden" role="status" aria-live="polite" aria-label="Scene status">{scene.announcement}</p>
    </section>
  );
}
