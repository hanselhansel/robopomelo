import type { ChallengeDefinition, StepId } from './workflow.js';
const rows: readonly [string,StepId,string,ChallengeDefinition['appliesWhen']][] = [
  ['problem-owner','frame','Who experiences this problem, who benefits from solving it, and who can approve the outcome?','always'],
  ['uncovered-needs','frame','Whose needs may be missing from this plan, including operators, maintenance and shift supervisors?','always'],
  ['constraints','frame','What constraints, alternatives or unresolved risks could make this deployment unsuitable?','always'],
  ['occupied-destination','flow','What happens at an occupied destination or when the receiving person is unavailable?','has-intended-flow'],
  ['pickup-failure','flow','How will people handle a failed pickup, damaged load or blocked route?','has-intended-flow'],
  ['handoff','flow','Who owns each handoff and how is successful transfer confirmed?','has-intended-flow'],
  ['peak-volume','flow','Which peak periods, load variations and shift changes differ from normal flow?','has-intended-flow'],
  ['baseline','success','How was the baseline measured, and what is still unknown or unverified?','has-kpi'],
  ['measurement-window','success','Does the measurement window include charging, interruptions and peak periods?','has-kpi'],
  ['tradeoffs','success','Which quality or operational measure must not worsen while the target improves?','has-kpi'],
  ['site-inputs','requirements','Which site inputs, load properties and human responsibilities must be confirmed before detailed engineering?','has-requirement'],
  ['failure-recovery','requirements','What recovery behavior is required when the robot, communication or material handoff fails?','has-requirement'],
  ['vendor-neutrality','requirements','Does each requirement describe the needed capability without assuming a particular vendor?','has-requirement'],
  ['acceptance-conditions','acceptance','Which operating conditions and exceptions must the acceptance procedure cover?','has-acceptance-test'],
  ['acceptance-evidence','acceptance','What evidence would let another engineer assess the criterion without reconstructing this discussion?','has-acceptance-test'],
  ['acceptance-authority','acceptance','Who will assess the evidence and who is authorized to approve the specification?','has-acceptance-test'],
];
export const questions: readonly ChallengeDefinition[] = Object.freeze(rows.map(([id,step,prompt,appliesWhen]) => Object.freeze({id,step,prompt,appliesWhen,version:'1.0.0',answerCollection:'challengeAnswers' as const})));
