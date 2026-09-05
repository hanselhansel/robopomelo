import type { Collection, Deployment, RecordBase } from '@robopomelo/spec';
export const collectionLabels: Record<Collection, string> = {
  stakeholders: 'Stakeholders',
  needs: 'Needs',
  problems: 'Problems',
  workflows: 'Material flows',
  challenges: 'Challenges',
  risks: 'Risks',
  assumptions: 'Assumptions',
  kpis: 'KPIs',
  requirements: 'Requirements',
  acceptanceTests: 'Acceptance tests',
  evidence: 'Future evidence requirements',
  decisions: 'Design decisions',
  challengeAnswers: 'Engineering answers',
};
export const singular: Record<Collection, string> = {
  stakeholders: 'stakeholder',
  needs: 'need',
  problems: 'problem',
  workflows: 'material flow',
  challenges: 'challenge',
  risks: 'risk',
  assumptions: 'assumption',
  kpis: 'KPI',
  requirements: 'requirement',
  acceptanceTests: 'acceptance test',
  evidence: 'future evidence requirement',
  decisions: 'design decision',
  challengeAnswers: 'engineering answer',
};
export function newRecord<C extends Collection>(collection: C): Deployment[C][number] {
  const base: RecordBase = {
    id: crypto.randomUUID(),
    title: `New ${singular[collection]}`,
    description: null,
    ownerId: null,
    sourceEvidenceIds: [],
    extensions: {},
  };
  const issue = {
    statement: null,
    nextAction: null,
    status: 'open' as const,
    resolution: null,
    relatedIds: [],
    requiredBeforeReview: false,
  };
  const extra: { [K in Collection]: Omit<Deployment[K][number], keyof RecordBase> } = {
    stakeholders: { role: null, responsibilities: [] },
    needs: { beneficiaryIds: [], outcome: null, workflowIds: [], requirementIds: [], disposition: null },
    problems: { affectedStakeholderIds: [], workflowIds: [], observation: null },
    workflows: {
      mode: 'intended',
      loadSubject: null,
      origin: null,
      destination: null,
      volume: null,
      steps: [],
      exceptions: [],
      needIds: [],
      assumptionIds: [],
    },
    challenges: issue,
    risks: { ...issue, consequence: null, mitigation: null, testIds: [] },
    assumptions: { ...issue, verificationAction: null },
    kpis: {
      definition: null,
      baseline: null,
      target: null,
      measurementMethod: null,
      measurementWindow: null,
      needIds: [],
      workflowIds: [],
    },
    requirements: {
      capability: null,
      rationale: null,
      constraints: [],
      needIds: [],
      workflowIds: [],
      kpiIds: [],
      testIds: [],
      verificationDisposition: null,
    },
    acceptanceTests: {
      subjectIds: [],
      preconditions: [],
      procedure: [],
      measurementMethod: null,
      criterion: null,
      evidenceRequirementIds: [],
      assessorId: null,
      approverId: null,
    },
    evidence: {
      purpose: 'acceptance-requirement',
      location: { kind: 'future', description: '' },
      required: false,
      relatedIds: [],
      provenance: null,
    },
    decisions: {
      question: null,
      options: [],
      rationale: null,
      state: 'proposed',
      relatedIds: [],
      actor: null,
      decidedAt: null,
    },
    challengeAnswers: { promptId: '', promptVersion: '1.0.0', answer: null, relatedIds: [] },
  };
  return { ...base, ...extra[collection] } as unknown as Deployment[C][number];
}
export function findRecord(deployment: Deployment, id: string) {
  for (const collection of Object.keys(collectionLabels) as Collection[]) {
    const record = deployment[collection].find((r) => r.id === id);
    if (record) return { collection, record };
  }
  return undefined;
}
