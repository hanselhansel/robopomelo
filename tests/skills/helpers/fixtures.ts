import type { PatchOperation } from '@robopomelo/spec';
const base = (id: string, title = id) => ({
  id,
  title,
  description: null,
  ownerId: null,
  sourceEvidenceIds: [],
  extensions: {},
});
const unknown = (note: string) => ({ state: 'unknown' as const, note });
export const stepOperations: PatchOperation[][] = [
  [
    {
      op: 'project',
      fields: {
        name: 'Fictional Skill replay',
        problem: {
          state: 'provided',
          value: 'Fixture statement: manual pallet transfers interrupt receiving.',
        },
        outcome: unknown('Operator must agree the desired outcome.'),
        scope: { state: 'provided', value: 'One fictional inbound flow only.' },
        approverId: unknown('The operator must designate an approver.'),
      },
    },
    {
      op: 'add',
      collection: 'stakeholders',
      record: {
        ...base('operator', 'Fixture operator'),
        role: { state: 'provided', value: 'Receiving operator' },
        responsibilities: ['Supply requirements'],
      },
    },
    {
      op: 'add',
      collection: 'needs',
      record: {
        ...base('need'),
        beneficiaryIds: ['operator'],
        outcome: { state: 'provided', value: 'Move a fixture pallet from receiving to buffer' },
        workflowIds: [],
        requirementIds: [],
        disposition: null,
      },
    },
  ],
  [
    {
      op: 'add',
      collection: 'workflows',
      record: {
        ...base('flow'),
        mode: 'intended',
        loadSubject: { state: 'provided', value: 'Fixture pallet' },
        origin: { state: 'provided', value: 'Fixture receiving' },
        destination: { state: 'provided', value: 'Fixture buffer' },
        volume: unknown('Peak demand has not been measured.'),
        steps: [{ id: 'step-1', title: 'Request transfer', location: null, handoffToId: null }],
        exceptions: [],
        needIds: ['need'],
        assumptionIds: [],
      },
    },
  ],
  [
    {
      op: 'add',
      collection: 'kpis',
      record: {
        ...base('kpi'),
        definition: { state: 'provided', value: 'Time per fixture transfer' },
        baseline: unknown('No measured baseline supplied.'),
        target: { state: 'unverified', value: { value: '12.50', unit: 'min', subject: 'fixture transfer' } },
        measurementMethod: { state: 'provided', value: 'Compare request and completion timestamps' },
        measurementWindow: unknown('Operator must choose the observation window.'),
        needIds: ['need'],
        workflowIds: ['flow'],
      },
    },
  ],
  [
    {
      op: 'add',
      collection: 'requirements',
      record: {
        ...base('requirement'),
        capability: { state: 'provided', value: 'Support the declared fixture transfer' },
        rationale: { state: 'provided', value: 'Addresses the fixture need' },
        constraints: [],
        needIds: ['need'],
        workflowIds: ['flow'],
        kpiIds: ['kpi'],
        testIds: [],
        verificationDisposition: unknown('Link the future acceptance plan.'),
      },
    },
  ],
  [
    {
      op: 'add',
      collection: 'evidence',
      record: {
        ...base('future-log'),
        purpose: 'acceptance-requirement',
        location: { kind: 'future', description: 'A future timing log. No test has run.' },
        required: false,
        relatedIds: [],
        provenance: null,
      },
    },
    {
      op: 'add',
      collection: 'acceptanceTests',
      record: {
        ...base('planned-test'),
        subjectIds: ['requirement'],
        preconditions: ['Use the agreed fixture scenario'],
        procedure: ['Record request and completion times'],
        measurementMethod: { state: 'provided', value: 'Compare timestamps' },
        criterion: unknown('The operator has not agreed a criterion.'),
        evidenceRequirementIds: ['future-log'],
        assessorId: unknown('Assign an assessor'),
        approverId: unknown('Assign an approver'),
      },
    },
  ],
];
export const backlinks: { capabilityId: string; operations: PatchOperation[] }[] = [
  {
    capabilityId: 'frame-robot-deployment',
    operations: [
      {
        op: 'update',
        collection: 'needs',
        id: 'need',
        fields: { workflowIds: ['flow'], requirementIds: ['requirement'] },
      },
    ],
  },
  {
    capabilityId: 'specify-amr-requirements',
    operations: [
      { op: 'update', collection: 'requirements', id: 'requirement', fields: { testIds: ['planned-test'] } },
    ],
  },
];
