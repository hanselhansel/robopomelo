import type { Question, SourceBase } from '@robopomelo/spec';
import type { ActiveQuestion, SubjectStatus } from './question.js';
export type ConversationEvent =
  | { kind: 'user'; sequence: number; at: string; text: string; attachmentIds: string[]; answer: { questionId: string; choiceId: string | null } | null; base: SourceBase }
  | { kind: 'agent'; sequence: number; at: string; runId: string; generation: number; summary: string; question: Question | null; citedSourceIds: string[]; replaces?: string; base: SourceBase }
  | { kind: 'source'; sequence: number; at: string; changedSubjectIds: string[]; base: SourceBase }
  | { kind: 'system'; sequence: number; at: string; code: string; text: string };
export interface SubjectRecord { status: SubjectStatus; askedAt?: number; resolvedAt?: number }
export interface ConversationState {
  formatVersion: '1.0.0';
  id: string;
  sequence: number;
  active: ActiveQuestion | null;
  history: ConversationEvent[];
  subjects: Record<string, SubjectRecord>;
}
export const CONVERSATION_EVENT_LIMIT = 2000;
export function emptyConversation(id: string): ConversationState {
  return { formatVersion: '1.0.0', id, sequence: 0, active: null, history: [], subjects: {} };
}
const fail = (code: string, detail: string): never => {
  throw new Error(code + ': ' + detail);
};
/** Pure, deterministic reducer over persisted events. One active question at a
 * time; replacement is explicit by prior question ID. */
export function applyConversationEvent(state: ConversationState, event: ConversationEvent): ConversationState {
  if (!Number.isSafeInteger(event.sequence) || event.sequence !== state.sequence + 1)
    fail('SEQUENCE_INVALID', `expected ${state.sequence + 1}, got ${event.sequence}`);
  if (state.history.length >= CONVERSATION_EVENT_LIMIT) fail('CONVERSATION_LIMIT', 'conversation event limit reached');
  const next: ConversationState = { ...state, sequence: event.sequence, history: [...state.history, event], subjects: { ...state.subjects } };
  switch (event.kind) {
    case 'user': {
      if (event.answer) {
        const active = state.active;
        if (!active || active.question.id !== event.answer.questionId) return fail('QUESTION_MISMATCH', 'answer names a question that is not active');
        if (active.stale) return fail('QUESTION_STALE', 'answer targets a stale question');
        for (const id of active.question.subjectIds) next.subjects[id] = { ...next.subjects[id], status: 'resolved', resolvedAt: event.sequence };
        next.active = null;
      } else if (state.active && !state.active.stale && (event.attachmentIds.length || event.text.trim())) {
        next.active = { ...state.active, stale: 'new-input' };
      }
      return next;
    }
    case 'agent': {
      if (event.question) {
        if (state.active && !state.active.stale && event.replaces !== state.active.question.id)
          fail('QUESTION_ACTIVE', 'a question is already active; name it in replaces');
        if (state.active && event.replaces !== undefined && event.replaces !== state.active.question.id) fail('QUESTION_MISMATCH', 'replaces names an unknown question');
        for (const id of event.question.subjectIds) {
          const current = next.subjects[id];
          if (current?.status === 'resolved') fail('QUESTION_INVALID', 'resolved subject ' + id);
          next.subjects[id] = { status: current?.status ?? 'unresolved', askedAt: event.sequence, ...(current?.resolvedAt === undefined ? {} : { resolvedAt: current.resolvedAt }) };
        }
        next.active = { question: event.question, runId: event.runId, generation: event.generation, base: event.base, sequence: event.sequence, stale: null };
      } else if (event.replaces !== undefined) {
        if (state.active?.question.id !== event.replaces) fail('QUESTION_MISMATCH', 'replaces names an unknown question');
        next.active = null;
      }
      return next;
    }
    case 'source': {
      for (const id of event.changedSubjectIds) if (next.subjects[id]?.status === 'resolved') next.subjects[id] = { ...next.subjects[id]!, status: 'contradicted' };
      if (state.active && !state.active.stale && event.changedSubjectIds.some((id) => state.active!.question.subjectIds.includes(id)))
        next.active = { ...state.active, stale: 'subject-changed' };
      return next;
    }
    case 'system':
      return next;
  }
}
