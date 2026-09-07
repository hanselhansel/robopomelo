import type { AgentReply, Question, QuestionChoice } from '@robopomelo/spec';
import { ProviderError } from '../contracts.js';
import { isRecord } from './http.js';

export const SUMMARY_MAX_CHARS = 4000;
export const CHOICES_MAX = 6;

const CHOICE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['id', 'label'],
  properties: { id: { type: 'string' }, label: { type: 'string' } },
};
const QUESTION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['id', 'subjectIds', 'prompt', 'choices', 'why'],
  properties: {
    id: { type: 'string' },
    subjectIds: { type: 'array', items: { type: 'string' } },
    prompt: { type: 'string' },
    choices: { type: 'array', items: CHOICE_SCHEMA, maxItems: CHOICES_MAX },
    why: { type: 'string' },
  },
};
export const AGENT_REPLY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'question', 'proposedActions', 'citedSourceIds'],
  properties: {
    summary: { type: 'string', maxLength: SUMMARY_MAX_CHARS },
    question: { anyOf: [QUESTION_SCHEMA, { type: 'null' }] },
    proposedActions: { type: 'array', items: {} },
    citedSourceIds: { type: 'array', items: { type: 'string' } },
  },
} as const;

function fail(detail: string): never {
  throw new ProviderError('PROVIDER_SCHEMA', `reply violates AgentReply schema: ${detail}`);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], where: string): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || actual.some((key, i) => key !== [...keys].sort()[i])) fail(`${where} keys`);
}
function stringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) fail(where);
  return value as string[];
}
function decodeChoice(value: unknown): QuestionChoice {
  if (!isRecord(value)) fail('choice');
  exactKeys(value, ['id', 'label'], 'choice');
  if (typeof value.id !== 'string' || typeof value.label !== 'string') fail('choice fields');
  return { id: value.id, label: value.label };
}
function decodeQuestion(value: unknown): Question | null {
  if (value === null) return null;
  if (!isRecord(value)) fail('question');
  exactKeys(value, ['id', 'subjectIds', 'prompt', 'choices', 'why'], 'question');
  if (typeof value.id !== 'string' || typeof value.prompt !== 'string' || typeof value.why !== 'string') fail('question fields');
  if (!Array.isArray(value.choices) || value.choices.length > CHOICES_MAX) fail('question choices');
  return {
    id: value.id,
    subjectIds: stringArray(value.subjectIds, 'question subjectIds'),
    prompt: value.prompt,
    choices: value.choices.map(decodeChoice),
    why: value.why,
  };
}

/** Closed decoder: unknown keys, wrong types and oversized fields are rejected rather than trimmed. */
export function decodeAgentReply(value: unknown): AgentReply {
  if (!isRecord(value)) fail('root');
  exactKeys(value, ['summary', 'question', 'proposedActions', 'citedSourceIds'], 'root');
  if (typeof value.summary !== 'string' || value.summary.length > SUMMARY_MAX_CHARS) fail('summary');
  if (!Array.isArray(value.proposedActions)) fail('proposedActions');
  return {
    summary: value.summary,
    question: decodeQuestion(value.question),
    proposedActions: [...value.proposedActions],
    citedSourceIds: stringArray(value.citedSourceIds, 'citedSourceIds'),
  };
}
