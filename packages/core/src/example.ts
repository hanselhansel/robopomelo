import { questions, type Deployment, type Knowledge, type RecordBase } from '@robopomelo/spec';
import { createBlankProject } from './factory.js';
const provided = <T>(value: T): Knowledge<T> => ({ state: 'provided', value });
const base = (id: string, title: string): RecordBase => ({
  id,
  title,
  description: null,
  ownerId: provided('stakeholder-integrator'),
  sourceEvidenceIds: [],
  extensions: {},
});
export function createInboundExample(input: {
  id: string;
  revision: string;
  timestamp: string;
  name?: string;
}): Deployment {
  const d = createBlankProject({
    ...input,
    name: input.name ?? 'Inbound pallet transfer (fictional example)',
  });
  d.extensions['robopomelo.example'] = { fictional: true };
  d.project.problem = provided(
    'Manual transfers from receiving to staging interrupt receiving work and have unclear exception ownership. This is a fictional discovery scenario.',
  );
  d.project.outcome = provided(
    'Define a repeatable receiving-to-staging flow and measurable acceptance criteria before selecting detailed engineering or simulation inputs.',
  );
  d.project.scope = provided(
    'Pallet movements between a receiving handoff and a staging handoff, including blocked destinations and failed pickups.',
  );
  d.project.exclusions = [
    'Rack handling',
    'Robot control',
    'Capacity prediction',
    'Safety certification',
    'Executed acceptance results',
  ];
  d.project.approverId = provided('stakeholder-operator');
  d.stakeholders = [
    {
      ...base('stakeholder-operator', 'Warehouse operations lead (example)'),
      ownerId: provided('stakeholder-operator'),
      role: provided('Warehouse operator'),
      responsibilities: [
        'Confirm the problem and intended flow',
        'Review assumptions and approve the specification',
      ],
    },
    {
      ...base('stakeholder-integrator', 'Integrator solutions engineer (example)'),
      role: provided('Solutions engineer'),
      responsibilities: [
        'Author the planning specification',
        'Collect site inputs and prepare the engineering handoff',
      ],
    },
  ];
  d.needs = [
    {
      ...base('need-transfer', 'Predictable inbound transfers'),
      beneficiaryIds: ['stakeholder-operator'],
      outcome: provided('Receiving staff know how material moves and who resolves exceptions.'),
      workflowIds: ['flow-intended'],
      requirementIds: ['requirement-transfer', 'requirement-recovery'],
      disposition: null,
    },
  ];
  d.problems = [
    {
      ...base('problem-interruption', 'Unclear transfer and exception ownership'),
      affectedStakeholderIds: ['stakeholder-operator'],
      workflowIds: ['flow-current'],
      observation: {
        state: 'unverified',
        value:
          'The example assumes transfer work interrupts receiving. Confirm this through observation before treating it as a site fact.',
      },
    },
  ];
  const flow = {
    loadSubject: provided('Loaded pallets'),
    origin: provided('Receiving handoff'),
    destination: provided('Staging handoff'),
    needIds: ['need-transfer'],
    assumptionIds: ['assumption-volume'],
  };
  d.workflows = [
    {
      ...base('flow-current', 'Current manual transfer'),
      ...flow,
      mode: 'current',
      volume: { state: 'unknown', note: 'Current volume has not been measured.' },
      steps: [
        {
          id: 'step-current-pickup',
          title: 'Receiving worker prepares a pallet',
          location: provided('Receiving'),
          handoffToId: provided('stakeholder-operator'),
        },
        {
          id: 'step-current-deliver',
          title: 'Worker transfers the pallet to staging',
          location: provided('Staging'),
          handoffToId: provided('stakeholder-operator'),
        },
      ],
      exceptions: [],
    },
    {
      ...base('flow-intended', 'Intended AMR transfer'),
      ...flow,
      mode: 'intended',
      volume: {
        state: 'unverified',
        value: { value: '60', unit: 'count/h', subject: 'pallet' },
        note: 'Fictional planning assumption, not a capacity calculation.',
      },
      steps: [
        {
          id: 'step-intended-ready',
          title: 'Operator releases a prepared pallet',
          location: provided('Receiving handoff'),
          handoffToId: provided('stakeholder-integrator'),
        },
        {
          id: 'step-intended-accept',
          title: 'Receiver confirms the staging handoff',
          location: provided('Staging handoff'),
          handoffToId: provided('stakeholder-operator'),
        },
      ],
      exceptions: [
        {
          id: 'exception-occupied',
          trigger: provided('The destination is occupied or the load cannot be picked up.'),
          response: provided(
            'Pause the planned transfer and notify the designated operator for the agreed recovery procedure.',
          ),
          ownerId: provided('stakeholder-operator'),
          testIds: ['test-recovery'],
        },
      ],
    },
  ];
  d.kpis = [
    {
      ...base('kpi-transfer-rate', 'Completed transfer rate'),
      definition: provided('Count completed receiving-to-staging pallet handoffs per hour.'),
      baseline: {
        state: 'unknown',
        note: 'Measure current performance over representative shifts.',
        ownerId: 'stakeholder-integrator',
        nextAction: 'Observe the current process and record the measurement window.',
      },
      target: provided({ value: '60', unit: 'count/h', subject: 'pallet' }),
      measurementMethod: provided(
        'Count confirmed destination handoffs with timestamps, preserving interrupted attempts separately.',
      ),
      measurementWindow: provided(
        'A representative hour including charging and interruptions; confirm the exact window with the operator.',
      ),
      needIds: ['need-transfer'],
      workflowIds: ['flow-intended'],
    },
  ];
  d.requirements = [
    {
      ...base('requirement-transfer', 'Move and confirm pallet handoffs'),
      capability: provided(
        'Transport the declared pallet load between the named handoffs and expose an observable completion acknowledgment.',
      ),
      rationale: provided('Make intended flow and handoff completion inspectable.'),
      constraints: [
        'Confirm load dimensions, mass, pickup interface and facility inputs before detailed engineering.',
      ],
      needIds: ['need-transfer'],
      workflowIds: ['flow-intended'],
      kpiIds: ['kpi-transfer-rate'],
      testIds: ['test-rate'],
      verificationDisposition: null,
    },
    {
      ...base('requirement-recovery', 'Support operator-led exception recovery'),
      capability: provided(
        'Expose a blocked destination or failed pickup and support the agreed operator-led recovery workflow.',
      ),
      rationale: provided('An exception must have a named owner and planned response.'),
      constraints: ['Confirm the recovery procedure with warehouse operations.'],
      needIds: ['need-transfer'],
      workflowIds: ['flow-intended'],
      kpiIds: [],
      testIds: ['test-recovery'],
      verificationDisposition: null,
    },
  ];
  d.assumptions = [
    {
      ...base('assumption-volume', 'Peak volume remains unverified'),
      statement: provided(
        'The fictional target of 60 pallets per hour is a planning input, not measured site demand.',
      ),
      nextAction: provided('Collect representative and peak receiving volumes.'),
      status: 'open',
      resolution: null,
      relatedIds: ['flow-intended', 'kpi-transfer-rate'],
      requiredBeforeReview: false,
      verificationAction: provided(
        'Compare the assumption with observed volumes and revise the target if needed.',
      ),
    },
  ];
  d.risks = [
    {
      ...base('risk-destination', 'Occupied destination delays transfer'),
      statement: provided('Staging may be occupied when a pallet arrives.'),
      nextAction: provided('Confirm an operator-owned holding and escalation procedure.'),
      status: 'open',
      resolution: null,
      relatedIds: ['flow-intended', 'requirement-recovery'],
      requiredBeforeReview: false,
      consequence: provided('Transfers can be delayed and receiving can queue.'),
      mitigation: provided('Define explicit destination readiness and exception ownership.'),
      testIds: ['test-recovery'],
    },
  ];
  d.acceptanceTests = [
    {
      ...base('test-rate', 'Measure planned transfer-rate criterion'),
      subjectIds: ['requirement-transfer', 'kpi-transfer-rate'],
      preconditions: ['Agreed load and route inputs are configured in the chosen test environment.'],
      procedure: [
        'Record the agreed observation window.',
        'Count confirmed destination handoffs and record interruptions.',
        'Compare the measured rate with the declared criterion.',
      ],
      measurementMethod: provided('Timestamped handoff count divided by the agreed observation duration.'),
      criterion: provided({
        kind: 'numeric',
        operator: 'gte',
        threshold: { value: '60', unit: 'count/h', subject: 'pallet' },
      }),
      evidenceRequirementIds: ['evidence-rate'],
      assessorId: provided('stakeholder-integrator'),
      approverId: provided('stakeholder-operator'),
    },
    {
      ...base('test-recovery', 'Observe occupied-destination recovery'),
      subjectIds: ['requirement-recovery'],
      preconditions: ['The operator has agreed the exception procedure.'],
      procedure: [
        'Present an occupied destination in the chosen test environment.',
        'Observe notification and operator-led recovery against the agreed procedure.',
      ],
      measurementMethod: provided(
        'Record whether the agreed notification and recovery procedure can be followed.',
      ),
      criterion: provided({ kind: 'boolean', expected: true }),
      evidenceRequirementIds: ['evidence-recovery'],
      assessorId: provided('stakeholder-integrator'),
      approverId: provided('stakeholder-operator'),
    },
  ];
  d.evidence = [
    ['evidence-rate', 'Future transfer observation log', 'test-rate'],
    ['evidence-recovery', 'Future recovery observation record', 'test-recovery'],
  ].map(([id, title, test]) => ({
    ...base(id!, title!),
    purpose: 'acceptance-requirement',
    location: {
      kind: 'future',
      description: 'Collect during future acceptance testing in the selected environment.',
    },
    required: true,
    relatedIds: [test!],
    provenance: provided('Planned evidence requirement. No result has been collected.'),
  }));
  d.challengeAnswers = questions.map((question) => ({
    ...base(`answer-${question.id}`, question.prompt),
    promptId: question.id,
    promptVersion: question.version,
    answer: {
      state: 'unknown',
      note: 'Discuss this engineering question with the operator and record the answer or a reason it does not apply.',
      ownerId: 'stakeholder-integrator',
      nextAction: 'Confirm during deployment discovery.',
    },
    relatedIds: ['need-transfer'],
  }));
  return d;
}
