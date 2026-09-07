import type { ConversationEvent, ConversationState } from './types.js';
import { InertQuestion } from './QuestionCard.js';
const time = (at: string) => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
function Entry({ event, activeQuestionId }: { event: ConversationEvent; activeQuestionId: string | null }) {
  switch (event.kind) {
    case 'user':
      return (
        <li className="agent-entry user">
          <p className="agent-entry-meta">
            You{event.answer ? (event.answer.choiceId ? ' answered' : ' replied') : ''} <time dateTime={event.at}>{time(event.at)}</time>
          </p>
          {event.text && <p>{event.text}</p>}
          {event.attachmentIds.length > 0 && (
            <p className="help">
              {event.attachmentIds.length} {event.attachmentIds.length === 1 ? 'file' : 'files'} attached
            </p>
          )}
        </li>
      );
    case 'agent':
      return (
        <li className="agent-entry agent">
          <p className="agent-entry-meta">
            Agent <time dateTime={event.at}>{time(event.at)}</time>
          </p>
          {event.summary && <p>{event.summary}</p>}
          <p className="help">
            {event.citedSourceIds.length} {event.citedSourceIds.length === 1 ? 'source' : 'sources'} cited
          </p>
          {event.question && event.question.id !== activeQuestionId && <InertQuestion question={event.question} />}
        </li>
      );
    case 'source':
      return (
        <li className="agent-entry source">
          <p className="agent-entry-meta">
            Source changed <time dateTime={event.at}>{time(event.at)}</time>
          </p>
          <p className="help">
            Revision {event.base.sourceRevision}
            {event.changedSubjectIds.length ? `. Affects ${event.changedSubjectIds.join(', ')}` : ''}
          </p>
        </li>
      );
    case 'system':
      return (
        <li className="agent-entry system">
          <p className="agent-entry-meta">
            {event.code} <time dateTime={event.at}>{time(event.at)}</time>
          </p>
          <p>{event.text}</p>
        </li>
      );
  }
}
/** Complete readable history. Past questions stay visible but never actionable. */
export function Conversation({ conversation }: { conversation: ConversationState }) {
  const activeId = conversation.active?.question.id ?? null;
  if (!conversation.history.length)
    return (
      <p className="help agent-empty">
        Describe what you are planning or ask about the current plan. The agent asks one question at a time and every draft stays a reviewable proposal.
      </p>
    );
  return (
    <ol className="agent-history" aria-label="Conversation history">
      {conversation.history.map((event) => (
        <Entry key={event.sequence} event={event} activeQuestionId={activeId} />
      ))}
    </ol>
  );
}
