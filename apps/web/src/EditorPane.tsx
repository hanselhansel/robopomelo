import type { Scope, StepId } from '@robopomelo/spec';
import type { DraftController, DraftView } from './lib/draft.js';
import type { Screen } from './lib/navigation.js';
import { ModalSuspensionContext } from './components/ui.js';
import { Planning } from './screens/Planning.js';
import { Review } from './screens/Review.js';
import { Changes } from './screens/Changes.js';
import type { ProposalSummary } from './screens/Changes.js';
import { Evidence } from './screens/Evidence.js';
import { History } from './screens/History.js';
import { Settings } from './screens/Settings.js';
interface Props {
  screen: Screen;
  parked: Screen | null;
  view: DraftView;
  draft: DraftController;
  revealId: string | null;
  scopes: Scope[];
  onView: (id: string) => void;
  onRefresh: () => Promise<void>;
  onResume: (proposal: ProposalSummary) => void;
  onSettings: () => void;
  onReturn: () => void;
  refreshTrust: () => Promise<void>;
}
export function EditorPane({
  screen,
  parked,
  view,
  draft,
  revealId,
  scopes,
  onView,
  onRefresh,
  onResume,
  onSettings,
  onReturn,
  refreshTrust,
}: Props) {
  const active = screen === 'settings' ? (parked ?? 'frame') : screen;
  return (
    <>
      <div hidden={screen === 'settings'}>
        <ModalSuspensionContext.Provider value={screen === 'settings'}>
          {['frame', 'flow', 'success', 'requirements', 'acceptance'].includes(active) ? (
            <Planning
              step={active as StepId}
              deployment={view.deployment}
              edit={(operation) => draft.edit(operation)}
              onView={onView}
              revealId={revealId}
            />
          ) : active === 'review' ? (
            <Review
              snapshot={view.committed}
              onView={onView}
              onRefresh={onRefresh}
              scopes={scopes}
              onSettings={onSettings}
            />
          ) : active === 'changes' ? (
            <Changes snapshot={view.committed} draft={draft} onResume={onResume} />
          ) : active === 'evidence' ? (
            <Evidence
              snapshot={view.committed}
              onRefresh={onRefresh}
              onView={onView}
              onSettings={onSettings}
            />
          ) : (
            <History snapshot={view.committed} onRefresh={onRefresh} />
          )}
        </ModalSuspensionContext.Provider>
      </div>
      {screen === 'settings' && (
        <Settings onTrustChange={refreshTrust} parked={Boolean(parked)} onReturn={onReturn} />
      )}
    </>
  );
}
