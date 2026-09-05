import { expect, it } from 'vitest';
import { checkSchema, type Collection, type Deployment } from '@robopomelo/spec';
import {
  createBlankProject,
  createInboundExample,
  validateDeployment,
  planningHash,
  approvalDetails,
} from '@robopomelo/core';
import { newRecord } from '../../apps/cli/src/wizard/record-defaults.js';
import { WizardDraft } from '../../apps/cli/src/wizard/draft.js';
import { referenceChoices } from '../../apps/cli/src/wizard/references.js';
const collections: Collection[] = [
  'stakeholders',
  'needs',
  'problems',
  'workflows',
  'challenges',
  'risks',
  'assumptions',
  'kpis',
  'requirements',
  'acceptanceTests',
  'evidence',
  'decisions',
  'challengeAnswers',
];
function snapshot(d: Deployment) {
  const validation = validateDeployment(d, {
      sourceRevision: d.meta.revisionId,
      sourceHash: 'a'.repeat(64),
      toolVersion: '1.0.0',
      evidence: [],
    }),
    details = approvalDetails(d, validation);
  return {
    deployment: d,
    sourceRevision: d.meta.revisionId,
    sourceHash: 'a'.repeat(64),
    planningHash: planningHash(d),
    validation,
    approvalStatus: details.status,
    approvalDetails: details,
    evidenceObservations: [],
  };
}
it('creates schema-valid missing-data records for every collection without asserted engineering facts', () => {
  const d = createBlankProject({
    id: 'project',
    name: 'Draft',
    revision: 'revision',
    timestamp: '2026-09-05T00:00:00Z',
  });
  for (const collection of collections) {
    const copy = structuredClone(d),
      record = newRecord(collection, `record-${collection}`, 'Supplied label', {
        mode: 'intended',
        purpose: 'acceptance-requirement',
        promptId: 'problem-owner',
        promptVersion: '1.0.0',
      });
    (copy[collection] as unknown[]).push(record);
    expect(checkSchema(copy)).toEqual([]);
    expect(record.description).toBeNull();
    expect(record.ownerId).toBeNull();
  }
});
it('builds a focused atomic patch without clearing untouched records', () => {
  const d = createInboundExample({ id: 'project', revision: 'revision', timestamp: '2026-09-05T00:00:00Z' }),
    draft = new WizardDraft(snapshot(d));
  draft.value.project.scope = { state: 'provided', value: 'Revised scope' };
  const patch = draft.patch({ kind: 'human', name: 'Supplied author' }, 'Clarify scope', 'mutation');
  expect(patch.operations).toEqual([
    { op: 'project', fields: { scope: { state: 'provided', value: 'Revised scope' } } },
  ]);
  expect(draft.value.stakeholders).toEqual(d.stakeholders);
  expect(d.project.scope).not.toEqual(draft.value.project.scope);
});
it('keeps mutually linked new records in one patch and preserves pending data across rejection', () => {
  const d = createBlankProject({
      id: 'project',
      name: 'Draft',
      revision: 'revision',
      timestamp: '2026-09-05T00:00:00Z',
    }),
    draft = new WizardDraft(snapshot(d));
  const need = newRecord('needs', 'need', 'Need'),
    requirement = newRecord('requirements', 'requirement', 'Requirement');
  need.requirementIds = ['requirement'];
  requirement.needIds = ['need'];
  draft.value.needs.push(need);
  draft.value.requirements.push(requirement);
  const patch = draft.patch({ kind: 'human', name: 'Supplied author' }, 'Record linked intent', 'mutation');
  expect(patch.operations).toHaveLength(2);
  expect(draft.dirty()).toBe(true);
  expect(draft.base.sourceHash).toBe('a'.repeat(64));
  draft.markProposed('proposal', 'digest');
  expect(draft.dirty()).toBe(false);
  draft.value.project.name = 'Unsaved';
  draft.discardPending();
  expect(draft.value.project.name).toBe('Draft');
  expect(draft.value.needs).toHaveLength(1);
});
it('filters reference candidates using the core predicate and current unsaved records', () => {
  const d = createInboundExample({ id: 'project', revision: 'revision', timestamp: '2026-09-05T00:00:00Z' });
  const current = d.workflows.find((w) => w.mode === 'current')!;
  expect(
    referenceChoices(d, 'subjectIds', '/acceptanceTests/test/subjectIds').map((c) => c.value),
  ).not.toContain(current.id);
  d.stakeholders.push(newRecord('stakeholders', 'new-person', 'New person'));
  expect(referenceChoices(d, 'ownerId', '/needs/need/ownerId').map((c) => c.value)).toContain('new-person');
  expect(
    referenceChoices(d, 'evidenceIds', '/kpis/kpi/verification/decl/evidenceIds').every(
      (c) => d.evidence.find((e) => e.id === c.value)?.purpose === 'planning',
    ),
  ).toBe(true);
});
