import type { Question, QuestionAnswer, SourceBase } from '@robopomelo/spec';
export type SubjectStatus = 'unresolved' | 'resolved' | 'contradicted';
export type StaleReason = 'subject-changed' | 'new-input' | 'replaced' | 'cancelled';
export interface ActiveQuestion {
  question: Question;
  runId: string;
  generation: number;
  base: SourceBase;
  sequence: number;
  stale: StaleReason | null;
}
export type AnswerCheck =
  | { ok: true }
  | { ok: false; code: 'NO_ACTIVE_QUESTION' | 'QUESTION_MISMATCH' | 'QUESTION_STALE' | 'CHOICE_UNKNOWN' | 'ANSWER_EMPTY' };
const ID = /^[A-Za-z0-9][A-Za-z0-9.:_-]{0,127}$/;
const invalid = (reason: string): never => {
  throw new Error('QUESTION_INVALID: ' + reason);
};
/** The model chooses the next material subject, but it may only ask about
 * subjects that are still open or explicitly contradicted. */
export function validateQuestion(question: Question, subjects: ReadonlyMap<string, SubjectStatus>): Question {
  if (!question || typeof question !== 'object') invalid('question must be an object');
  if (typeof question.id !== 'string' || !ID.test(question.id)) invalid('question id');
  if (typeof question.prompt !== 'string' || !question.prompt.trim() || question.prompt.length > 2000) invalid('prompt length');
  if (typeof question.why !== 'string' || question.why.length > 2000) invalid('why length');
  if (!Array.isArray(question.subjectIds) || !question.subjectIds.length || question.subjectIds.length > 8) invalid('subject count');
  if (new Set(question.subjectIds).size !== question.subjectIds.length) invalid('duplicate subjects');
  for (const id of question.subjectIds) {
    if (typeof id !== 'string' || !ID.test(id)) invalid('subject id');
    const status = subjects.get(id);
    if (status === undefined) invalid('unknown subject ' + id);
    if (status === 'resolved') invalid('resolved subject ' + id);
  }
  if (!Array.isArray(question.choices) || question.choices.length > 6) invalid('choice count');
  const ids = new Set<string>();
  for (const choice of question.choices) {
    if (!choice || typeof choice.id !== 'string' || !ID.test(choice.id) || typeof choice.label !== 'string' || !choice.label.trim() || choice.label.length > 200)
      invalid('choice');
    if (ids.has(choice.id)) invalid('duplicate choice');
    ids.add(choice.id);
  }
  return {
    id: question.id,
    subjectIds: [...question.subjectIds],
    prompt: question.prompt,
    choices: question.choices.map((choice) => ({ id: choice.id, label: choice.label })),
    why: question.why,
  };
}
/** An old button can never answer a newer or stale question. */
export function checkAnswer(active: ActiveQuestion | null, answer: QuestionAnswer): AnswerCheck {
  if (!active) return { ok: false, code: 'NO_ACTIVE_QUESTION' };
  if (answer.questionId !== active.question.id) return { ok: false, code: 'QUESTION_MISMATCH' };
  if (active.stale) return { ok: false, code: 'QUESTION_STALE' };
  if (answer.choiceId !== null && !active.question.choices.some((choice) => choice.id === answer.choiceId))
    return { ok: false, code: 'CHOICE_UNKNOWN' };
  if (answer.choiceId === null && !answer.text.trim() && !answer.attachmentIds.length) return { ok: false, code: 'ANSWER_EMPTY' };
  return { ok: true };
}
