import type { Deployment, Kpi, RecordBase } from '../src/index.js';
export const base = (id: string): RecordBase => ({id, title:id, description:null, ownerId:null, sourceEvidenceIds:[], extensions:{}});
export const blank = {
  specVersion:'1.0.0', project:{id:'project-1', name:'Draft', problem:null, outcome:null, scope:null, exclusions:[], approverId:null},
  meta:{revisionId:'rev-1', parentRevisionId:null, createdAt:'2026-09-05T00:00:00Z', updatedAt:'2026-09-05T00:00:00Z'},
  stakeholders:[], needs:[], problems:[], workflows:[], challenges:[], risks:[], assumptions:[], kpis:[], requirements:[], acceptanceTests:[], evidence:[], decisions:[], challengeAnswers:[],
  review:{currentApprovalId:null, acknowledgments:[], waivers:[], approvals:[], revocations:[], invalidations:[]}, extensions:{}
} satisfies Deployment;
export const kpi = (overrides: Partial<Kpi> = {}): Kpi => ({...base('kpi-1'), definition:null, baseline:null, target:null, measurementMethod:null, measurementWindow:null, needIds:[], workflowIds:[], ...overrides});
export const populated = {
  ...blank,
  stakeholders:[{...base('person'), role:null, responsibilities:[]}],
  needs:[{...base('need'), beneficiaryIds:['person'], outcome:null, workflowIds:['flow'], requirementIds:['requirement'], disposition:null}],
  problems:[{...base('problem'), affectedStakeholderIds:['person'], workflowIds:['flow'], observation:null}],
  workflows:[{...base('flow'), mode:'intended', loadSubject:null, origin:null, destination:null, volume:null, steps:[{id:'step',title:'Arrival',location:null,handoffToId:null}], exceptions:[{id:'exception',trigger:null,response:null,ownerId:null,testIds:['test']}], needIds:['need'],assumptionIds:['assumption']}],
  challenges:[{...base('challenge'),statement:null,nextAction:null,status:'open',resolution:null,relatedIds:[],requiredBeforeReview:false}],
  risks:[{...base('risk'),statement:null,nextAction:null,status:'open',resolution:null,relatedIds:[],requiredBeforeReview:false,consequence:null,mitigation:null,testIds:['test']}],
  assumptions:[{...base('assumption'),statement:null,nextAction:null,status:'open',resolution:null,relatedIds:[],requiredBeforeReview:false,verificationAction:null}],
  kpis:[kpi()],
  requirements:[{...base('requirement'),capability:null,rationale:null,constraints:[],needIds:['need'],workflowIds:['flow'],kpiIds:['kpi-1'],testIds:['test'],verificationDisposition:null}],
  acceptanceTests:[{...base('test'),subjectIds:['requirement'],preconditions:[],procedure:[],measurementMethod:null,criterion:{state:'provided',value:{kind:'boolean',expected:false}},evidenceRequirementIds:['evidence'],assessorId:null,approverId:null}],
  evidence:[{...base('evidence'),purpose:'acceptance-requirement',location:{kind:'future',description:'Plan'},required:false,relatedIds:['test'],provenance:null}],
  decisions:[{...base('decision'),question:null,options:[],rationale:null,state:'proposed',relatedIds:[],actor:null,decidedAt:null}],
  challengeAnswers:[{...base('answer'),promptId:'prompt-1',promptVersion:'1.0.0',answer:null,relatedIds:[]}]
} satisfies Deployment;
export const actor = {kind:'human',name:'Reviewer'} as const;
export const hash = 'a'.repeat(64);
export const acknowledgment = {id:'ack',findingFingerprint:hash,planningHash:hash,actor,reason:'Reviewed',recordedAt:'2026-09-05T00:00:00Z',source:'local'};
export const approval = {id:'approval',reviewerId:'person',reviewerName:'Reviewer',recorder:actor,reviewerRole:'Engineer',decision:'approved' as const,decidedAt:'2026-09-05T00:00:00Z',source:'local',sourceRevision:'rev-1',sourceHash:hash,planningHash:hash,ruleSetVersion:'1.0.0',acknowledgmentIds:[],waiverIds:[],evidenceIds:[]};
export const envelope = {formatVersion:'1.0.0' as const,id:'change',projectId:'project-1',baseRevision:'rev-1',baseHash:hash,actor,purpose:'Revise plan'};
