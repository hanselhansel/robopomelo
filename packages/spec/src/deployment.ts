import type { Extensions, ProjectInfo, RevisionMeta } from './common.js';
import type {
  Stakeholder,
  Need,
  Problem,
  Workflow,
  OpenIssue,
  Risk,
  Assumption,
  Kpi,
  Requirement,
  AcceptanceTest,
  Evidence,
  Decision,
  ChallengeAnswer,
} from './authoring.js';
import type { ReviewState } from './review.js';

export interface Deployment {
  specVersion: '1.0.0';
  project: ProjectInfo;
  meta: RevisionMeta;
  stakeholders: Stakeholder[];
  needs: Need[];
  problems: Problem[];
  workflows: Workflow[];
  challenges: OpenIssue[];
  risks: Risk[];
  assumptions: Assumption[];
  kpis: Kpi[];
  requirements: Requirement[];
  acceptanceTests: AcceptanceTest[];
  evidence: Evidence[];
  decisions: Decision[];
  challengeAnswers: ChallengeAnswer[];
  review: ReviewState;
  extensions: Extensions;
}
