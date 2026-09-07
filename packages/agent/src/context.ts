import type { Collection, Deployment, Knowledge, ProjectSnapshot } from '@robopomelo/spec';
import { fields, questions } from '@robopomelo/spec';
import { knowledgeText, promptApplies } from '@robopomelo/core';
import type { ConversationState } from './conversation.js';
import type { SubjectStatus } from './question.js';
export interface SourceExcerpt { sourceId: string; title: string; text: string }
export interface ContextInput {
  snapshot: Pick<ProjectSnapshot, 'deployment' | 'sourceRevision' | 'sourceHash'>;
  conversation: ConversationState;
  excerpts: SourceExcerpt[];
  maxChars?: number;
}
export interface BuiltContext {
  text: string;
  subjects: Map<string, SubjectStatus>;
  sourceIds: string[];
  truncated: boolean;
}
type Row = Record<string, unknown> & { id: string; title?: string };
const knowledgeFields = fields.filter((field) => field.inputKind.startsWith('knowledge-'));
const open = (value: Knowledge<unknown> | undefined) => value == null || value.state === 'unknown' || value.state === 'unverified';
const rows = (deployment: Deployment, collection: Collection): Row[] => {
  const value = (deployment as unknown as Record<string, unknown>)[collection];
  return Array.isArray(value) ? (value as Row[]) : [];
};
/** Subjects the agent may ask about: unresolved knowledge fields, applicable
 * unanswered prompts, and anything the conversation resolved or contradicted. */
export function collectSubjects(deployment: Deployment, conversation: ConversationState): Map<string, SubjectStatus> {
  const subjects = new Map<string, SubjectStatus>();
  const answered = new Set(deployment.challengeAnswers.map((answer) => answer.promptId));
  for (const prompt of questions)
    if (promptApplies(deployment, prompt.appliesWhen)) subjects.set('challenge:' + prompt.id, answered.has(prompt.id) ? 'resolved' : 'unresolved');
  for (const field of knowledgeFields) {
    if (field.collection === 'project') {
      const value = (deployment.project as unknown as Record<string, Knowledge<unknown>>)[field.path];
      if (open(value)) subjects.set('project.' + field.path, 'unresolved');
      continue;
    }
    for (const row of rows(deployment, field.collection))
      if (open(row[field.path] as Knowledge<unknown> | undefined)) subjects.set(row.id + '.' + field.path, 'unresolved');
  }
  for (const [id, record] of Object.entries(conversation.subjects)) {
    if (record.status === 'resolved' && subjects.has(id)) subjects.set(id, 'resolved');
    else if (record.status === 'contradicted') subjects.set(id, 'contradicted');
  }
  return subjects;
}
const clip = (text: string, limit: number) => (text.length > limit ? text.slice(0, limit - 1) + '…' : text);
const labelFor = (id: string): string => {
  if (id.startsWith('challenge:')) return questions.find((prompt) => 'challenge:' + prompt.id === id)?.prompt ?? id;
  const path = id.slice(id.lastIndexOf('.') + 1);
  return fields.find((field) => field.path === path)?.label ?? path;
};
function recordLines(deployment: Deployment): string[] {
  const lines: string[] = [];
  const project = deployment.project as unknown as Record<string, Knowledge<unknown>>;
  lines.push(`Project: ${deployment.project.name}`);
  for (const path of ['problem', 'outcome', 'scope']) lines.push(`  ${path}: ${clip(knowledgeText(project[path]), 400)}`);
  const collections: Collection[] = ['stakeholders', 'needs', 'problems', 'workflows', 'risks', 'assumptions', 'kpis', 'requirements', 'acceptanceTests'];
  for (const collection of collections) {
    const items = rows(deployment, collection);
    if (!items.length) continue;
    lines.push(`${collection}:`);
    for (const row of items.slice(0, 20)) {
      const summary = knowledgeFields
        .filter((field) => field.collection === collection && field.path !== 'description' && field.path !== 'ownerId')
        .map((field) => `${field.path}=${clip(knowledgeText(row[field.path] as Knowledge<unknown> | undefined), 160)}`)
        .slice(0, 6)
        .join('; ');
      lines.push(`  - ${row.id} ${clip(String(row.title ?? ''), 120)} ${summary}`);
    }
  }
  return lines;
}
/** Deterministic, bounded model context. Newest turns win when space is short;
 * excerpts are clipped per source. Never includes credentials or raw files. */
export function buildContext(input: ContextInput): BuiltContext {
  const maxChars = input.maxChars ?? 24_000;
  const subjects = collectSubjects(input.snapshot.deployment, input.conversation);
  const unresolved = [...subjects].filter(([, status]) => status !== 'resolved');
  const sections: string[] = [];
  sections.push(`Source revision ${input.snapshot.sourceRevision}\n` + recordLines(input.snapshot.deployment).join('\n'));
  sections.push('Unresolved subjects (ask only about these, one at a time):\n' + unresolved.slice(0, 60).map(([id, status]) => `  - ${id} [${status}] ${clip(labelFor(id), 160)}`).join('\n'));
  const excerptBudget = Math.max(1000, Math.floor(maxChars / Math.max(4, input.excerpts.length * 2)));
  const sourceIds: string[] = [];
  for (const excerpt of input.excerpts.slice(0, 12)) {
    sourceIds.push(excerpt.sourceId);
    sections.push(`Source ${excerpt.sourceId} (${clip(excerpt.title, 120)}):\n${clip(excerpt.text, excerptBudget)}`);
  }
  if (input.conversation.active) {
    const active = input.conversation.active;
    sections.push(`Active question ${active.question.id}${active.stale ? ` (stale: ${active.stale})` : ''}: ${clip(active.question.prompt, 500)}`);
  }
  let text = sections.join('\n\n');
  let truncated = false;
  const turns: string[] = [];
  for (const event of [...input.conversation.history].reverse()) {
    let line: string;
    if (event.kind === 'user') line = `User: ${clip(event.text, 600)}${event.answer ? ` [answers ${event.answer.questionId}${event.answer.choiceId ? ' with ' + event.answer.choiceId : ''}]` : ''}${event.attachmentIds.length ? ` [attached ${event.attachmentIds.length}]` : ''}`;
    else if (event.kind === 'agent') line = `Agent: ${clip(event.summary, 600)}${event.question ? ` [asked ${event.question.id}]` : ''}`;
    else if (event.kind === 'source') line = `Source changed: ${event.changedSubjectIds.slice(0, 10).join(', ')}`;
    else line = `System ${event.code}: ${clip(event.text, 200)}`;
    const candidate = text + '\n\nRecent turns (newest last):\n' + [line, ...turns].join('\n');
    if (candidate.length > maxChars || turns.length >= 30) { truncated = true; break; }
    turns.unshift(line);
  }
  if (turns.length) text += '\n\nRecent turns (newest last):\n' + turns.join('\n');
  if (text.length > maxChars) { text = text.slice(0, maxChars - 1) + '…'; truncated = true; }
  if (input.excerpts.some((excerpt) => excerpt.text.length > excerptBudget) || input.conversation.history.length > turns.length) truncated = true;
  return { text, subjects, sourceIds, truncated };
}
