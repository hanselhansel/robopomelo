import { useId, useState } from 'react';
import type { Question } from '@robopomelo/spec';
import type { StaleReason } from './types.js';
const STALE_TEXT: Record<StaleReason, string> = {
  'new-input': 'Superseded by new input',
  'subject-changed': 'The source changed for this subject',
  replaced: 'Replaced by a newer question',
  cancelled: 'Cancelled before it was answered',
};
export function staleText(reason: StaleReason | null): string | null {
  return reason ? STALE_TEXT[reason] : null;
}
/** The one active question. Choices and the answer field post against this
 * exact question id; a stale question keeps its text readable but inert. */
export function QuestionCard({
  question,
  stale,
  busy,
  onAnswer,
}: {
  question: Question;
  stale: StaleReason | null;
  busy: boolean;
  onAnswer: (choiceId: string | null, text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const id = useId();
  const disabled = busy || stale !== null;
  const reason = staleText(stale);
  const submit = async () => {
    if (!text.trim() || disabled) return;
    if (await onAnswer(null, text)) setText('');
  };
  return (
    <section className={`agent-question${stale ? ' stale' : ''}`} aria-labelledby={`${id}-prompt`}>
      <p className="eyebrow">Question</p>
      <p className="agent-question-prompt" id={`${id}-prompt`}>
        {question.prompt}
      </p>
      {question.why && (
        <details className="agent-why">
          <summary>Why this matters</summary>
          <p>{question.why}</p>
        </details>
      )}
      {reason && <p className="agent-stale">{reason}</p>}
      {question.choices.length > 0 && (
        <div className="agent-choices" role="group" aria-label="Choices">
          {question.choices.map((choice) => (
            <button key={choice.id} type="button" disabled={disabled} onClick={() => void onAnswer(choice.id, '')}>
              {choice.label}
            </button>
          ))}
        </div>
      )}
      <div className="agent-answer">
        <label htmlFor={`${id}-answer`} className="visually-hidden">
          Type your answer
        </label>
        <input
          id={`${id}-answer`}
          value={text}
          placeholder="Type your answer..."
          disabled={disabled}
          aria-describedby={reason ? `${id}-reason` : undefined}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <button type="button" className="primary" disabled={disabled || !text.trim()} onClick={() => void submit()}>
          Answer
        </button>
      </div>
      {reason && (
        <p className="help" id={`${id}-reason`}>
          Use the composer below for fresh input.
        </p>
      )}
    </section>
  );
}
/** A past question in history: readable, never actionable. */
export function InertQuestion({ question }: { question: Question }) {
  return (
    <div className="agent-question inert">
      <p className="agent-question-prompt">{question.prompt}</p>
      {question.choices.length > 0 && (
        <ul className="agent-inert-choices">
          {question.choices.map((choice) => (
            <li key={choice.id}>{choice.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
