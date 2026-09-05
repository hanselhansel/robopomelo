import { checkSchema, type Deployment } from '@robopomelo/spec';
export function createBlankProject(input: {
  id: string;
  name: string;
  revision: string;
  timestamp: string;
}): Deployment {
  const result: Deployment = {
    specVersion: '1.0.0',
    project: {
      id: input.id,
      name: input.name,
      problem: null,
      outcome: null,
      scope: null,
      exclusions: [],
      approverId: null,
    },
    meta: {
      revisionId: input.revision,
      parentRevisionId: null,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
    },
    stakeholders: [],
    needs: [],
    problems: [],
    workflows: [],
    challenges: [],
    risks: [],
    assumptions: [],
    kpis: [],
    requirements: [],
    acceptanceTests: [],
    evidence: [],
    decisions: [],
    challengeAnswers: [],
    review: {
      currentApprovalId: null,
      acknowledgments: [],
      waivers: [],
      approvals: [],
      revocations: [],
      invalidations: [],
    },
    extensions: {},
  };
  const errors = checkSchema(result);
  if (errors.length) throw new Error(`Invalid new project: ${errors[0]!.instancePath} ${errors[0]!.message}`);
  return result;
}
