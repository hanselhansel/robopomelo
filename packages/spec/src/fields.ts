import type { Collection } from './patch.js';
import type { FieldDefinition, FieldKind, StepId, WorkflowDefinition } from './workflow.js';
import { questions } from './questions.js';
type Row = [
  path: string,
  label: string,
  kind: FieldKind,
  help: string,
  target?: Collection | Collection[] | undefined,
  options?: string[],
];
const fieldsList: FieldDefinition[] = [];
function add(collection: Collection | 'project', step: StepId, rows: Row[], common = true): void {
  const shared: Row[] = common
    ? [
        ['title', 'Name', 'text', 'Use a short name that colleagues will recognize.'],
        [
          'description',
          'Description',
          'knowledge-text',
          'Describe the context or leave an explicit unknown.',
        ],
        [
          'ownerId',
          'Owner',
          'knowledge-id',
          'Select the person responsible for following this item through.',
          'stakeholders',
        ],
        [
          'sourceEvidenceIds',
          'Planning sources',
          'reference-list',
          'Link the planning evidence supporting this item.',
          'evidence',
        ],
        [
          'verification',
          'Verification support',
          'verification',
          'Record required support and any explicitly supplied attributed attestation.',
        ],
      ]
    : [];
  for (const [path, label, inputKind, help, referenceTarget, values] of [...shared, ...rows])
    fieldsList.push({
      id: `${collection}.${path}`,
      collection,
      path,
      label,
      inputKind,
      help,
      step,
      ...(referenceTarget ? { referenceTarget } : {}),
      ...(values ? { options: values.map((value) => ({ value, label: value.replaceAll('-', ' ') })) } : {}),
    });
}
const ref = (path: string, label: string, target: Collection | Collection[]): Row => [
  path,
  label,
  'reference-list',
  `Link the relevant ${label.toLowerCase()} by their stable records.`,
  target,
];
const text = (path: string, label: string, help: string): Row => [path, label, 'knowledge-text', help];
const issue: Row[] = [
  text('statement', 'Open issue', 'Describe the unresolved issue.'),
  text('nextAction', 'Next action', 'State what happens next to resolve or investigate it.'),
  ['status', 'Status', 'enum', 'Keep unresolved work visible.', undefined, ['open', 'resolved']],
  text('resolution', 'Resolution', 'Explain how this was resolved, with supporting evidence.'),
  ref('relatedIds', 'Related records', [
    'needs',
    'problems',
    'workflows',
    'requirements',
    'kpis',
    'acceptanceTests',
    'risks',
    'assumptions',
    'challenges',
  ]),
  [
    'requiredBeforeReview',
    'Required before review',
    'boolean',
    'Changing this review obligation requires decision-recording authority.',
  ],
];
add(
  'project',
  'frame',
  [
    ['name', 'Project name', 'text', 'Name this deployment planning project.'],
    text('problem', 'Problem to solve', 'Describe the current problem and who experiences it.'),
    text('outcome', 'Intended outcome', 'Describe the desired change, without assuming a robot solution.'),
    text('scope', 'Scope', 'Define the workflow and operational boundaries covered here.'),
    [
      'exclusions',
      'Out of scope',
      'string-list',
      'List boundaries that reviewers should not assume are included.',
    ],
    [
      'approverId',
      'Specification approver',
      'knowledge-id',
      'Select the warehouse stakeholder who can approve this specification.',
      'stakeholders',
    ],
  ],
  false,
);
add('stakeholders', 'frame', [
  text('role', 'Role', 'Describe this person’s operational role.'),
  ['responsibilities', 'Responsibilities', 'string-list', 'List what this stakeholder owns or reviews.'],
]);
add('needs', 'frame', [
  text('outcome', 'Needed outcome', 'Describe what success means to the beneficiary.'),
  ref('beneficiaryIds', 'Beneficiaries', 'stakeholders'),
  ref('workflowIds', 'Material flows', 'workflows'),
  ref('requirementIds', 'Requirements', 'requirements'),
  text(
    'disposition',
    'Coverage disposition',
    'Explain any need that has no flow or requirement coverage yet.',
  ),
]);
add('problems', 'frame', [
  text('observation', 'Observed problem', 'Record what is observed and distinguish it from assumptions.'),
  ref('affectedStakeholderIds', 'Affected stakeholders', 'stakeholders'),
  ref('workflowIds', 'Material flows', 'workflows'),
]);
add('challenges', 'frame', issue);
add('risks', 'requirements', [
  ...issue,
  text('consequence', 'Potential consequence', 'Describe the consequence if this risk occurs.'),
  text('mitigation', 'Proposed treatment', 'Describe how the risk will be addressed or investigated.'),
  ref('testIds', 'Acceptance tests', 'acceptanceTests'),
]);
add('assumptions', 'requirements', [
  ...issue,
  text('verificationAction', 'Verification action', 'State how the assumption will be checked.'),
]);
add('workflows', 'flow', [
  [
    'mode',
    'Flow type',
    'enum',
    'Distinguish current operation from the intended operation.',
    undefined,
    ['current', 'intended'],
  ],
  text('loadSubject', 'Material or load', 'Name the material and relevant load characteristics.'),
  text('origin', 'Origin', 'Describe where material is picked up.'),
  text('destination', 'Destination', 'Describe where material is delivered.'),
  [
    'volume',
    'Volume or rate',
    'knowledge-quantity',
    'Record value, units and material subject, or state what is unknown.',
  ],
  ['steps', 'Flow steps', 'flow-steps', 'Describe ordered movements and human handoffs.'],
  [
    'exceptions',
    'Exceptions',
    'flow-exceptions',
    'Describe exception triggers, responses, owners and planned tests.',
  ],
  ref('needIds', 'Needs', 'needs'),
  ref('assumptionIds', 'Assumptions', 'assumptions'),
]);
add('kpis', 'success', [
  text('definition', 'KPI definition', 'Define precisely what is measured.'),
  [
    'baseline',
    'Current baseline',
    'knowledge-quantity',
    'Record the current measured value or its unknown/unverified state.',
  ],
  ['target', 'Target', 'knowledge-quantity', 'Record the target with explicit units and measured subject.'],
  text('measurementMethod', 'Measurement method', 'Explain how observations are obtained.'),
  text(
    'measurementWindow',
    'Measurement window',
    'Describe duration, shifts, charging and interruptions included.',
  ),
  ref('needIds', 'Needs', 'needs'),
  ref('workflowIds', 'Material flows', 'workflows'),
]);
add('requirements', 'requirements', [
  text(
    'capability',
    'Required capability',
    'Describe what the AMR deployment must be able to do in vendor-neutral terms.',
  ),
  text('rationale', 'Rationale', 'Explain the need or constraint behind this requirement.'),
  ['constraints', 'Constraints', 'string-list', 'Record load, environment and integration constraints.'],
  ref('needIds', 'Needs', 'needs'),
  ref('workflowIds', 'Material flows', 'workflows'),
  ref('kpiIds', 'KPIs', 'kpis'),
  ref('testIds', 'Acceptance tests', 'acceptanceTests'),
  text(
    'verificationDisposition',
    'Verification disposition',
    'Link a planned test or explain another explicit verification disposition.',
  ),
]);
add('acceptanceTests', 'acceptance', [
  ref('subjectIds', 'Subjects', ['requirements', 'kpis', 'workflows']),
  [
    'preconditions',
    'Preconditions',
    'string-list',
    'Describe conditions required before this test can be performed.',
  ],
  ['procedure', 'Procedure', 'string-list', 'List ordered steps for the future acceptance test.'],
  text('measurementMethod', 'Measurement method', 'Explain how evidence will be measured or observed.'),
  [
    'criterion',
    'Pass criterion',
    'knowledge-criterion',
    'Define a numeric, Boolean or categorical criterion. This does not execute a test.',
  ],
  ref('evidenceRequirementIds', 'Future evidence requirements', 'evidence'),
  [
    'assessorId',
    'Assessor',
    'knowledge-id',
    'Select the person expected to assess future test evidence.',
    'stakeholders',
  ],
  [
    'approverId',
    'Approver',
    'knowledge-id',
    'Select the person who can approve this planned acceptance criterion.',
    'stakeholders',
  ],
]);
add('evidence', 'acceptance', [
  [
    'purpose',
    'Purpose',
    'enum',
    'Separate planning support, future acceptance requirements and decision evidence.',
    undefined,
    ['planning', 'acceptance-requirement', 'decision'],
  ],
  [
    'required',
    'Required support',
    'boolean',
    'Declare whether this evidence is required in its planning context.',
  ],
  ref('relatedIds', 'Related records', [
    'needs',
    'problems',
    'workflows',
    'requirements',
    'kpis',
    'acceptanceTests',
    'risks',
    'assumptions',
    'challenges',
    'decisions',
  ]),
  text('provenance', 'Provenance', 'Describe where the evidence comes from and what it supports.'),
]);
add('decisions', 'requirements', [
  text('question', 'Decision to make', 'State the decision or tradeoff being considered.'),
  ['options', 'Options', 'string-list', 'List the alternatives considered.'],
  text('rationale', 'Rationale', 'Explain the selected or proposed direction.'),
  [
    'state',
    'Decision state',
    'enum',
    'Acceptance needs explicitly supplied human authority.',
    undefined,
    ['proposed', 'accepted'],
  ],
  ref('relatedIds', 'Related records', [
    'needs',
    'workflows',
    'requirements',
    'risks',
    'assumptions',
    'challenges',
  ]),
]);
add('challengeAnswers', 'frame', [
  text(
    'answer',
    'Engineering answer',
    'Record your answer, an explicit unknown or why the question does not apply.',
  ),
  ref('relatedIds', 'Related records', [
    'needs',
    'problems',
    'workflows',
    'requirements',
    'kpis',
    'acceptanceTests',
    'risks',
    'assumptions',
    'challenges',
  ]),
]);
export const fields: readonly FieldDefinition[] = Object.freeze(
  fieldsList.map((field) => Object.freeze(field)),
);
const steps: readonly [StepId, string, string][] = [
  ['frame', 'Frame the deployment', 'Define the problem, intended outcome and people.'],
  ['flow', 'Specify material flow', 'Describe current and intended movements and exceptions.'],
  ['success', 'Define success', 'Record KPI baselines, targets and measurement methods.'],
  ['requirements', 'Specify requirements', 'Connect vendor-neutral capabilities to needs and risks.'],
  ['acceptance', 'Plan acceptance', 'Define future procedures, criteria, evidence and approvers.'],
];
export const workflows: readonly WorkflowDefinition[] = Object.freeze(
  steps.map(([id, title, description]) => ({
    id,
    title,
    description,
    fields: fields.filter((field) => field.step === id),
    questions: questions.filter((question) => question.step === id),
  })),
);
