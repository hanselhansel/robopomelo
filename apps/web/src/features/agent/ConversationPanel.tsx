import type { DesktopBridge, SourceBase } from '@robopomelo/spec';
import { ErrorNotice } from '../../components/ui.js';
import { useConversation } from './useConversation.js';
import { Conversation } from './Conversation.js';
import { QuestionCard } from './QuestionCard.js';
import { Composer } from './Composer.js';
import { ModelSelector } from './ModelSelector.js';
import { RunStatus } from './RunStatus.js';
import './agent.css';
/** Left conversation column: history, the one active question, the composer
 * and the model selector. Nothing here auto-selects a model or a connection. */
export function ConversationPanel({
  bridge,
  base,
  onProposalsChanged,
  pollMs,
}: {
  bridge?: DesktopBridge | undefined;
  base: SourceBase;
  onProposalsChanged?: (() => void) | undefined;
  pollMs?: number | undefined;
}) {
  const agent = useConversation({
    base,
    ...(bridge ? { bridge } : {}),
    ...(onProposalsChanged ? { onProposalsChanged } : {}),
    ...(pollMs === undefined ? {} : { pollMs }),
  });
  const state = agent.state;
  const active = state?.conversation.active ?? null;
  const sendReason = state === null ? 'Loading the conversation.' : null;
  return (
    <aside className="agent-panel" aria-label="Agent conversation">
      <div className="agent-scroll">
        <ErrorNotice message={agent.error} />
        {state && <Conversation conversation={state.conversation} />}
        {active && <QuestionCard key={active.question.id} question={active.question} stale={active.stale} busy={agent.busy} onAnswer={agent.answer} />}
      </div>
      <div className="agent-dock">
        <RunStatus run={state?.run ?? null} events={agent.events} status={agent.status} busy={agent.busy} onCancel={agent.cancel} onExtend={agent.extend} />
        <Composer bridge={bridge} busy={agent.busy} disabledReason={sendReason} onSend={agent.send} />
        <ModelSelector
          inventory={agent.inventory}
          selection={state?.selection ?? null}
          busy={agent.busy}
          canConnect={Boolean(bridge)}
          onSelect={agent.select}
          onConnect={agent.connect}
          onDisconnect={agent.disconnect}
        />
      </div>
    </aside>
  );
}
