import type { Collection } from './patch.js';
export type CapabilityStage = 'experimental' | 'beta' | 'stable' | 'deprecated' | 'removed';
export interface Capability {
  id: string;
  kind: 'core' | 'skill' | 'adapter';
  stage: CapabilityStage;
  specRange: string;
  enabledByDefault: boolean;
  available: boolean;
  dependencies: string[];
  fieldsRead: string[];
  fieldsWritten: string[];
  commands: string[];
}
export const skillNames = [
  'frame-robot-deployment',
  'specify-material-flow',
  'define-deployment-kpis',
  'specify-amr-requirements',
  'design-acceptance-plan',
  'plan-amr-deployment',
] as const;
const rows: readonly [(typeof skillNames)[number], string[], (Collection | 'project')[]][] = [
  [
    'frame-robot-deployment',
    [],
    ['project', 'stakeholders', 'needs', 'problems', 'challenges', 'challengeAnswers'],
  ],
  [
    'specify-material-flow',
    ['frame-robot-deployment'],
    ['workflows', 'assumptions', 'challenges', 'challengeAnswers'],
  ],
  [
    'define-deployment-kpis',
    ['frame-robot-deployment', 'specify-material-flow'],
    ['kpis', 'assumptions', 'challengeAnswers'],
  ],
  [
    'specify-amr-requirements',
    ['specify-material-flow', 'define-deployment-kpis'],
    ['requirements', 'risks', 'assumptions', 'decisions', 'challengeAnswers'],
  ],
  [
    'design-acceptance-plan',
    ['specify-amr-requirements', 'define-deployment-kpis'],
    ['acceptanceTests', 'evidence', 'risks', 'challengeAnswers'],
  ],
  [
    'plan-amr-deployment',
    skillNames.slice(0, 5),
    [
      'project',
      'stakeholders',
      'needs',
      'problems',
      'workflows',
      'kpis',
      'requirements',
      'acceptanceTests',
      'evidence',
      'risks',
      'assumptions',
      'challenges',
      'decisions',
      'challengeAnswers',
    ],
  ],
];
const core: Capability = {
  id: 'deployment-planning',
  kind: 'core',
  stage: 'stable',
  specRange: '^1.0.0',
  enabledByDefault: true,
  available: true,
  dependencies: [],
  fieldsRead: ['*'],
  fieldsWritten: [],
  commands: ['show', 'validate', 'capabilities'],
};
const skills: Capability[] = rows.map(([id, dependencies, collections]) => ({
  id,
  kind: 'skill',
  stage: 'stable',
  specRange: '^1.0.0',
  enabledByDefault: true,
  available: true,
  dependencies: [...dependencies],
  fieldsRead: ['*'],
  fieldsWritten: collections.map((collection) => `${collection}.*`),
  commands: ['capabilities', 'show', 'patch check', 'patch diff', 'patch apply', 'validate'],
}));
const future: Capability[] = [
  'git-intent',
  'local-mcp',
  'layout-2d',
  'capacity-model',
  'open-rmf',
  'gazebo',
  'vda5050',
  'lif',
  'isaac-sim',
  'acceptance-results',
  'production-evidence',
].map((id) => ({
  id,
  kind: 'adapter',
  stage: 'experimental',
  specRange: '^1.0.0',
  enabledByDefault: false,
  available: false,
  dependencies: ['deployment-planning'],
  fieldsRead: [],
  fieldsWritten: [],
  commands: [],
}));
export const capabilities: readonly Capability[] = Object.freeze(
  [core, ...skills, ...future].map((value) => Object.freeze(value)),
);
export const knownExtensionNamespaces = Object.freeze(['robopomelo.example', 'robopomelo.capabilities']);
