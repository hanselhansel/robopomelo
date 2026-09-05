import type { Collection, Deployment, Knowledge } from '@robopomelo/spec';
import { hasValue } from '@robopomelo/core';
import { referenceChoices, referenceMany, referenceOne } from './references.js';
import type { TerminalAdapter } from './terminal.js';
export interface EditorContext {
  deployment: Deployment;
  collection: Collection | 'project';
  recordId: string;
  id: () => string;
  cwd?: string;
  path?: string;
}
export const recordPath = (context: EditorContext) =>
  context.path ?? `/${context.collection}/${context.recordId}`;
export function knowledgeDetails(
  terminal: TerminalAdapter,
  context: EditorContext,
  previous: Knowledge<unknown>,
) {
  return {
    owner: () =>
      referenceOne(
        terminal,
        referenceChoices(context.deployment, 'ownerId', `${recordPath(context)}/ownerId`),
        true,
      ),
    evidence: () =>
      referenceMany(
        terminal,
        referenceChoices(context.deployment, 'sourceEvidenceIds', `${recordPath(context)}/sourceEvidenceIds`),
        hasValue(previous) ? (previous.sourceEvidenceIds ?? []) : [],
      ),
  };
}
