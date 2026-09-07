import { expect, it } from 'vitest';
import type { Question } from '@robopomelo/spec';
import { validateQuestion, checkAnswer } from '../../packages/agent/src/question.js';
import { emptyConversation, applyConversationEvent, type ConversationEvent } from '../../packages/agent/src/conversation.js';
const base = { sourceRevision: 'rev-1', sourceHash: 'a'.repeat(64) };
const q = (id: string, subjectIds: string[], choices = [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }]): Question =>
  ({ id, subjectIds, prompt: 'Is the dock shared?', choices, why: 'Shared docks change queueing.' });
const subjects = new Map([['challenge:handoff', 'unresolved'], ['need-1.owner', 'unresolved'], ['kpi-1.baseline', 'resolved'], ['risk-2.likelihood', 'contradicted']] as const);
it('accepts questions on unresolved or contradicted subjects and rejects resolved, unknown or malformed ones', () => {
  expect(validateQuestion(q('q1', ['challenge:handoff', 'need-1.owner']), subjects).id).toBe('q1');
  expect(validateQuestion(q('q2', ['risk-2.likelihood']), subjects).subjectIds).toEqual(['risk-2.likelihood']);
  expect(() => validateQuestion(q('q3', ['kpi-1.baseline']), subjects)).toThrow('QUESTION_INVALID');
  expect(() => validateQuestion(q('q4', ['nonexistent']), subjects)).toThrow('QUESTION_INVALID');
  expect(() => validateQuestion(q('q5', []), subjects)).toThrow('QUESTION_INVALID');
  expect(() => validateQuestion(q('q6', ['challenge:handoff'], [{ id: 'a', label: 'A' }, { id: 'a', label: 'Again' }]), subjects)).toThrow('QUESTION_INVALID');
  expect(() => validateQuestion({ ...q('q7', ['challenge:handoff']), prompt: '' }, subjects)).toThrow('QUESTION_INVALID');
  expect(() => validateQuestion({ ...q('q8', ['challenge:handoff']), prompt: 'x'.repeat(2001) }, subjects)).toThrow('QUESTION_INVALID');
});
it('correlates answers to the exact active question and refuses stale or foreign buttons', () => {
  const active = { question: q('q1', ['challenge:handoff']), runId: 'r1', generation: 0, base, sequence: 3, stale: null };
  expect(checkAnswer(active, { ...base, questionId: 'q1', choiceId: 'yes', text: '', attachmentIds: [] })).toEqual({ ok: true });
  expect(checkAnswer(active, { ...base, questionId: 'q0', choiceId: 'yes', text: '', attachmentIds: [] })).toEqual({ ok: false, code: 'QUESTION_MISMATCH' });
  expect(checkAnswer(active, { ...base, questionId: 'q1', choiceId: 'maybe', text: '', attachmentIds: [] })).toEqual({ ok: false, code: 'CHOICE_UNKNOWN' });
  expect(checkAnswer({ ...active, stale: 'subject-changed' }, { ...base, questionId: 'q1', choiceId: 'yes', text: '', attachmentIds: [] })).toEqual({ ok: false, code: 'QUESTION_STALE' });
  expect(checkAnswer(null, { ...base, questionId: 'q1', choiceId: null, text: 'free text', attachmentIds: [] })).toEqual({ ok: false, code: 'NO_ACTIVE_QUESTION' });
  expect(checkAnswer(active, { ...base, questionId: 'q1', choiceId: null, text: '', attachmentIds: [] })).toEqual({ ok: false, code: 'ANSWER_EMPTY' });
});
it('keeps one active question, resolves its subjects on answer and lets new input replace a pending question', () => {
  let state = emptyConversation('c1');
  const events: ConversationEvent[] = [
    { kind: 'user', sequence: 1, at: 't1', text: 'We move pallets.', attachmentIds: [], answer: null, base },
    { kind: 'agent', sequence: 2, at: 't2', runId: 'r1', generation: 0, summary: 'Noted.', question: q('q1', ['challenge:handoff', 'need-1.owner']), citedSourceIds: ['evidence-1'], base },
  ];
  for (const event of events) state = applyConversationEvent(state, event);
  expect(state.active?.question.id).toBe('q1');
  expect(state.subjects['challenge:handoff']).toEqual({ status: 'unresolved', askedAt: 2 });
  // The same question asked again by a later run must not silently duplicate; an explicit replacement names the prior question.
  expect(() => applyConversationEvent(state, { kind: 'agent', sequence: 3, at: 't3', runId: 'r2', generation: 0, summary: 'Again', question: q('q2', ['need-1.owner']), citedSourceIds: [], base })).toThrow('QUESTION_ACTIVE');
  state = applyConversationEvent(state, { kind: 'user', sequence: 3, at: 't3', text: '', attachmentIds: [], answer: { questionId: 'q1', choiceId: 'yes' }, base });
  expect(state.active).toBeNull();
  expect(state.subjects['challenge:handoff']).toMatchObject({ status: 'resolved', resolvedAt: 3 });
  expect(state.subjects['need-1.owner']).toMatchObject({ status: 'resolved', resolvedAt: 3 });
  state = applyConversationEvent(state, { kind: 'agent', sequence: 4, at: 't4', runId: 'r2', generation: 0, summary: 'Next', question: q('q2', ['risk-2.likelihood']), citedSourceIds: [], base });
  state = applyConversationEvent(state, { kind: 'user', sequence: 5, at: 't5', text: '', attachmentIds: ['file-9'], answer: null, base });
  expect(state.active?.stale).toBe('new-input');
  expect(checkAnswer(state.active, { ...base, questionId: 'q2', choiceId: 'yes', text: '', attachmentIds: [] })).toEqual({ ok: false, code: 'QUESTION_STALE' });
  state = applyConversationEvent(state, { kind: 'agent', sequence: 6, at: 't6', runId: 'r3', generation: 0, summary: 'Replaced', question: q('q3', ['risk-2.likelihood']), citedSourceIds: [], replaces: 'q2', base });
  expect(state.active?.question.id).toBe('q3');
  expect(state.history.map(entry => entry.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(state.sequence).toBe(6);
});
it('rejects out-of-order sequences and marks the active question stale only for relevant subject changes', () => {
  let state = emptyConversation('c2');
  state = applyConversationEvent(state, { kind: 'agent', sequence: 1, at: 't', runId: 'r1', generation: 0, summary: 's', question: q('q1', ['need-1.owner']), citedSourceIds: [], base });
  expect(() => applyConversationEvent(state, { kind: 'user', sequence: 1, at: 't', text: 'dup', attachmentIds: [], answer: null, base })).toThrow('SEQUENCE_INVALID');
  state = applyConversationEvent(state, { kind: 'source', sequence: 2, at: 't', changedSubjectIds: ['kpi-1.baseline'], base: { ...base, sourceRevision: 'rev-2' } });
  expect(state.active?.stale).toBeNull();
  state = applyConversationEvent(state, { kind: 'source', sequence: 3, at: 't', changedSubjectIds: ['need-1.owner'], base: { ...base, sourceRevision: 'rev-3' } });
  expect(state.active?.stale).toBe('subject-changed');
});
