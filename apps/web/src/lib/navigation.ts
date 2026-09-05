import { fields, questions } from '@robopomelo/spec/browser';
import type { Collection, Deployment, Finding, StepId } from '@robopomelo/spec';
import { findRecord } from './records.js';
export type Screen = StepId | 'review' | 'changes' | 'evidence' | 'history' | 'settings';
export interface FindingTarget {
  screen: Screen;
  recordId?: string;
  questionId?: string;
  controlId: string;
  historical?: string;
}
const homes: Record<Collection, Screen> = {
  stakeholders: 'frame',
  needs: 'frame',
  problems: 'frame',
  workflows: 'flow',
  challenges: 'flow',
  risks: 'flow',
  assumptions: 'flow',
  kpis: 'success',
  requirements: 'requirements',
  acceptanceTests: 'acceptance',
  evidence: 'acceptance',
  decisions: 'requirements',
  challengeAnswers: 'frame',
};
export function recordScreen(d: Deployment, id: string): Screen {
  const found = findRecord(d, id);
  if (!found) return 'history';
  if (found.collection === 'challengeAnswers' && 'promptId' in found.record) {
    const promptId = found.record.promptId;
    return questions.find((q) => q.id === promptId)?.step ?? 'frame';
  }
  return homes[found.collection];
}
export function findingTarget(d: Deployment, f: Finding): FindingTarget {
  const parts = (f.paths[0] ?? '')
    .split('/')
    .filter(Boolean)
    .map((p) => p.replaceAll('~1', '/').replaceAll('~0', '~'));
  const collection = parts[0] as Collection | 'project' | undefined;
  const fieldName = collection === 'project' ? parts[1] : parts[2];
  if (collection === 'project') {
    const field = fields.find((v) => v.collection === 'project' && v.path === fieldName);
    return {
      screen: 'frame',
      controlId: `project-${fieldName ?? 'name'}${field?.inputKind.startsWith('knowledge-') ? '-state' : ''}`,
    };
  }
  const question = questions.find((q) => f.message.includes(q.id));
  if (collection === 'challengeAnswers' && question) {
    const answer = d.challengeAnswers.find((a) => a.promptId === question.id);
    return {
      screen: question.step,
      ...(answer ? { recordId: answer.id } : {}),
      questionId: question.id,
      controlId: `${answer?.id ?? question.id}-state`,
    };
  }
  if (collection && collection in homes) {
    const rows = d[collection];
    const record = rows.find((r) => f.recordIds.includes(r.id)) ?? rows[Number(parts[1])];
    if (!record) return { screen: homes[collection], controlId: `add-${collection}` };
    const field = fields.find((v) => v.collection === collection && v.path === fieldName);
    let controlId = `${record.id}-${fieldName ?? 'title'}${field?.inputKind.startsWith('knowledge-') ? '-state' : ''}`;
    if (collection === 'workflows' && (fieldName === 'steps' || fieldName === 'exceptions')) {
      const flow = d.workflows.find((r) => r.id === record.id)!;
      const child = flow[fieldName][Number(parts[3])];
      if (child) {
        const name =
          parts[4] === 'ownerId' ? 'owner' : parts[4] === 'handoffToId' ? 'handoff' : (parts[4] ?? 'title');
        controlId = `${record.id}-${fieldName}-${child.id}-${name}${name === 'title' ? '' : '-state'}`;
      }
    }
    return { screen: recordScreen(d, record.id), recordId: record.id, controlId };
  }
  const id = f.recordIds[0];
  if (id) {
    const found = findRecord(d, id);
    if (found) return { screen: recordScreen(d, id), recordId: id, controlId: `${id}-title` };
    return { screen: 'history', controlId: 'section-heading', historical: id };
  }
  return { screen: 'review', controlId: 'section-heading' };
}
export function focusControl(id: string) {
  const node = document.getElementById(id);
  if (!node) return;
  let ancestor: HTMLElement | null = node;
  while (ancestor) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  const target = node.matches('input,select,textarea,button,a,[tabindex]')
    ? node
    : node.querySelector<HTMLElement>('input,select,textarea,button,a,[tabindex]');
  target?.scrollIntoView({ block: 'center' });
  target?.focus();
}
