import { expect, it } from 'vitest';
import { checkSchema, type Deployment, type Knowledge, type ValidationContext } from '@robopomelo/spec';
import { blank, base, approval } from '../../spec/test/fixtures.js';
import { planningHash } from '../src/planning-hash.js';
export const provided = <T>(value:T): Knowledge<T> => ({state:'provided',value});
export const context = (evidence:ValidationContext['evidence']=[]):ValidationContext => ({sourceRevision:'rev-1',sourceHash:'a'.repeat(64),toolVersion:'1.0.0',evidence});
export const attachment = () => ({...base('planning-evidence'),purpose:'planning' as const,location:{kind:'attachment' as const,path:'evidence/measurement.txt',sha256:'b'.repeat(64),size:10},required:true,relatedIds:['metric'],provenance:provided('Measured by engineer')});
export function complete(): Deployment {
  const d:Deployment=structuredClone(blank);
  d.project={...d.project,problem:provided('Manual transfers delay receiving'),outcome:provided('Predictable pallet transfer'),scope:provided('Inbound receiving'),approverId:provided('person')};
  d.stakeholders=[{...base('person'),role:provided('Operator'),responsibilities:['Assess acceptance evidence']}];
  d.needs=[{...base('need'),beneficiaryIds:['person'],outcome:provided('Move pallets'),workflowIds:['flow'],requirementIds:['requirement'],disposition:null}];
  d.workflows=[{...base('flow'),ownerId:provided('person'),mode:'intended',loadSubject:provided('pallet'),origin:provided('Receiving'),destination:provided('Staging'),volume:provided({value:'10',unit:'count/h',subject:'pallet'}),steps:[],exceptions:[],needIds:['need'],assumptionIds:[]}];
  d.kpis=[{...base('metric'),ownerId:provided('person'),definition:provided('Transfers per hour'),baseline:provided({value:'0',unit:'count/h',subject:'pallet'}),target:provided({value:'10',unit:'count/h',subject:'pallet'}),measurementMethod:provided('Count completed transfers'),measurementWindow:provided('Eight hour shift'),needIds:['need'],workflowIds:['flow']}];
  d.requirements=[{...base('requirement'),capability:provided('Transfer a pallet between named endpoints'),rationale:provided('Reduce manual transfer burden'),constraints:[],needIds:['need'],workflowIds:['flow'],kpiIds:['metric'],testIds:['test'],verificationDisposition:null}];
  d.acceptanceTests=[{...base('test'),subjectIds:['requirement'],preconditions:[],procedure:['Observe one transfer'],measurementMethod:provided('Observe destination'),criterion:provided({kind:'boolean',expected:false}),evidenceRequirementIds:['future-evidence'],assessorId:provided('person'),approverId:provided('person')}];
  d.evidence=[{...base('future-evidence'),purpose:'acceptance-requirement',location:{kind:'future',description:'Acceptance observations'},required:true,relatedIds:['test'],provenance:null}];
  const prompts=['problem-owner','uncovered-needs','constraints','occupied-destination','pickup-failure','handoff','peak-volume','baseline','measurement-window','tradeoffs','site-inputs','failure-recovery','vendor-neutrality','acceptance-conditions','acceptance-evidence','acceptance-authority'];
  d.challengeAnswers=prompts.map(id=>({...base(`answer-${id}`),promptId:id,promptVersion:'1.0.0',answer:provided('Engineer will document the applicable conditions before deployment'),relatedIds:[]}));
  return d;
}
export function approved(d:Deployment):Deployment {
  d.review.approvals=[{...approval,planningHash:planningHash(d)}]; d.review.currentApprovalId='approval'; return d;
}
export function issue() { return {...base('issue'),statement:provided('Confirm receiving access'),ownerId:provided('person'),nextAction:provided('Observe next shift'),status:'open' as const,resolution:null,relatedIds:[],requiredBeforeReview:false}; }
it('uses schema-valid complete planning fixture without empirical acceptance results',()=>expect(checkSchema(complete())).toEqual([]));
