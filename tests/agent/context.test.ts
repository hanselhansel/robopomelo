import { expect, it } from 'vitest';
import { createBlankProject, createInboundExample } from '@robopomelo/core';
import { buildContext, collectSubjects } from '../../packages/agent/src/context.js';
import { emptyConversation, applyConversationEvent } from '../../packages/agent/src/conversation.js';
const meta = { id: 'project-1', revision: 'rev-1', timestamp: '2026-09-07T00:00:00Z' };
const base = { sourceRevision: 'rev-1', sourceHash: 'b'.repeat(64) };
it('derives unresolved subjects from unknown knowledge fields and unanswered applicable prompts only', () => {
  const blank = createBlankProject({ ...meta, name: 'Blank' });
  const subjects = collectSubjects(blank, emptyConversation('c'));
  expect(subjects.get('challenge:problem-owner')).toBe('unresolved');
  expect(subjects.has('challenge:occupied-destination')).toBe(false);
  expect(subjects.get('project.problem')).toBe('unresolved');
  const example = createInboundExample(meta);
  const exampleSubjects = collectSubjects(example, emptyConversation('c'));
  expect(exampleSubjects.has('challenge:occupied-destination')).toBe(true);
  const answered = example.challengeAnswers.map(answer => 'challenge:' + answer.promptId);
  expect(answered.length).toBeGreaterThan(0);
  for (const id of answered) expect(exampleSubjects.get(id)).toBe('resolved');
  expect([...exampleSubjects].filter(([id, status]) => id.startsWith('challenge:') && status === 'resolved').map(([id]) => id).sort()).toEqual([...new Set(answered)].sort());
  const unknownField = [...exampleSubjects.keys()].find(id => !id.startsWith('challenge:') && !id.startsWith('project.'));
  expect(unknownField).toBeDefined();
  const [recordId, path] = unknownField!.split('.');
  const record = Object.values(example).flatMap(value => Array.isArray(value) ? value : []).find(row => (row as { id?: string }).id === recordId) as Record<string, unknown>;
  expect((record[path!] as { state?: string } | null)?.state ?? 'null').toMatch(/unknown|unverified|null/);
});
it('carries conversation resolutions into subject status and marks contradictions', () => {
  const blank = createBlankProject({ ...meta, name: 'Blank' });
  let conversation = emptyConversation('c');
  conversation = applyConversationEvent(conversation, { kind: 'agent', sequence: 1, at: 't', runId: 'r', generation: 0, summary: 's', citedSourceIds: [], base,
    question: { id: 'q1', subjectIds: ['challenge:problem-owner'], prompt: 'Who owns it?', choices: [], why: 'w' } });
  conversation = applyConversationEvent(conversation, { kind: 'user', sequence: 2, at: 't', text: 'The receiving lead.', attachmentIds: [], answer: { questionId: 'q1', choiceId: null }, base });
  expect(collectSubjects(blank, conversation).get('challenge:problem-owner')).toBe('resolved');
  conversation = applyConversationEvent(conversation, { kind: 'source', sequence: 3, at: 't', changedSubjectIds: ['challenge:problem-owner'], base });
  expect(collectSubjects(blank, conversation).get('challenge:problem-owner')).toBe('contradicted');
});
it('builds bounded context with cited excerpts, unresolved subjects and recent turns, never whole transcripts', () => {
  const example = createInboundExample(meta);
  let conversation = emptyConversation('c');
  for (let i = 1; i <= 40; i++)
    conversation = applyConversationEvent(conversation, { kind: 'user', sequence: i, at: 't', text: 'Turn ' + i + ' ' + 'x'.repeat(500), attachmentIds: [], answer: null, base });
  const built = buildContext({ snapshot: { deployment: example, sourceRevision: 'rev-1', sourceHash: base.sourceHash },
    conversation, excerpts: [{ sourceId: 'evidence-brief', title: 'initial-brief.txt', text: 'Move inbound pallets to storage. ' + 'y'.repeat(50_000) }], maxChars: 12_000 });
  expect(built.text.length).toBeLessThanOrEqual(12_000);
  expect(built.truncated).toBe(true);
  expect(built.text).toContain('Turn 40');
  expect(built.text).not.toContain('Turn 1 ');
  expect(built.text).toContain('initial-brief.txt');
  expect(built.text).toContain('Unresolved subjects');
  expect(built.sourceIds).toEqual(['evidence-brief']);
  expect([...built.subjects.values()]).toContain('unresolved');
  expect(built.text).not.toMatch(/Bearer |sk-or-/);
});
