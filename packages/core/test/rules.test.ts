import { describe, expect, it } from 'vitest';
import type { Deployment, ValidationContext } from '@robopomelo/spec';
import { validateDeployment } from '../src/validation.js';
import { catalogue } from '../src/rules/catalogue.js';
import { complete, context, attachment, provided, approved, issue } from './validation-fixtures.test.js';
import { planningHash } from '../src/planning-hash.js';
import { acknowledgment } from '../../spec/test/fixtures.js';
type Change=(d:Deployment,c:ValidationContext)=>unknown;
const cases: [string,Change][] = [
 ['RP-001',d=>Object.assign(d,{rogue:true})],
 ['RP-002',d=>{d.needs[0]!.id='person';}],
 ['RP-003',d=>{d.needs[0]!.beneficiaryIds=['requirement'];}],
 ['RP-004',d=>{d.extensions['robopomelo.capabilities']={required:['unknown']};}],
 ['RP-010',d=>{d.project.scope={state:'not-applicable',reason:'No scope'};}],
 ['RP-011',d=>{d.project.approverId=null;}],
 ['RP-012',d=>{d.needs[0]!.workflowIds=[];d.needs[0]!.requirementIds=[];}],
 ['RP-013',d=>{d.needs[0]!.outcome=null;}],
 ['RP-020',d=>{d.workflows[0]!.mode='current';}],
 ['RP-021',d=>{d.challengeAnswers=d.challengeAnswers.filter(a=>a.promptId!=='handoff');}],
 ['RP-022',d=>{d.workflows[0]!.volume={state:'unknown',note:'Peak unmeasured'};}],
 ['RP-030',d=>{d.kpis[0]!.measurementWindow=null;}],
 ['RP-031',d=>{d.kpis[0]!.baseline={state:'unknown',note:'Unmeasured'};}],
 ['RP-032',d=>{d.kpis[0]!.baseline=provided({value:'10',unit:'count/h',subject:'tote'});}],
 ['RP-040',d=>{d.requirements[0]!.testIds=[];}],
 ['RP-041',d=>{d.challenges=[{...issue(),requiredBeforeReview:true}];}],
 ['RP-042',d=>{d.requirements[0]!.capability=null;}],
 ['RP-050',d=>{d.acceptanceTests[0]!.procedure=[];}],
 ['RP-051',d=>{d.acceptanceTests[0]!.evidenceRequirementIds=[];}],
 ['RP-060',d=>{d.evidence.push(attachment());}],
 ['RP-061',d=>{d.evidence.push({...attachment(),location:{kind:'external',uri:'https://example.com/measurement'}});}],
 ['RP-062',d=>{d.kpis[0]!.verification=[{id:'verify',claimPath:'baseline',required:true,evidenceIds:[],attestation:null}];}],
 ['RP-070',d=>{d.challenges=[{...issue(),nextAction:null}];}],
 ['RP-071',d=>{d.challenges=[issue()];}],
 ['RP-080',d=>{approved(d);d.project.scope=provided('Different scope');}],
 ['RP-081',d=>{approved(d);d.review.approvals[0]!.source=' ';}],
 ['RP-090',d=>{d.extensions['vendor.geometry']={x:1};}],
];
describe('approved rule catalogue',()=>{
 it('has exactly the 27 reserved meanings',()=>expect(catalogue.map(r=>r.id).sort()).toEqual(cases.map(([id])=>id).sort()));
 for (const [id,change] of cases) {
  it(`${id} detects its applicable failure`,()=>{const d=complete(), c=context();change(d,c);expect(validateDeployment(d,c).findings.map(f=>f.ruleId)).toContain(id);});
  it(`${id} does not fire for a complete counterexample`,()=>expect(validateDeployment(complete(),context()).findings.map(f=>f.ruleId)).not.toContain(id));
 }
});
it('returns exact readiness labels and deterministic immutable results',()=>{
 const d=complete(), original=structuredClone(d); const report=validateDeployment(d,context());
 expect(report.label).toBe('Specification ready for review'); expect(report.readiness).toBe('ready');
 expect(validateDeployment(d,context())).toEqual(report);expect(d).toEqual(original);
 d.kpis[0]!.baseline=null;expect(validateDeployment(d,context()).label).toBe('Specification ready with warnings');
 d.project.problem=null;expect(validateDeployment(d,context()).label).toBe('Specification blocked');
});
it('acknowledges warnings without suppressing them and accepts only scoped eligible waivers',()=>{
 const d=complete();d.kpis[0]!.baseline=null;
 const f=validateDeployment(d,context()).findings.find(f=>f.ruleId==='RP-031')!;
 d.review.acknowledgments=[{...acknowledgment,findingFingerprint:f.fingerprint,planningHash:planningHash(d)}];
 expect(validateDeployment(d,context()).counts).toMatchObject({warnings:1,unacknowledged:0});
 d.review.waivers=[{...d.review.acknowledgments[0]!,id:'waiver',ruleId:'RP-031',evidenceIds:[]}];
 expect(validateDeployment(d,context()).counts).toMatchObject({warnings:0,waived:1});
 d.review.waivers[0]!.planningHash='0'.repeat(64);expect(validateDeployment(d,context()).counts.waived).toBe(0);
});
it('never permits an initial blocker waiver or unrelated issue to clear a blocker',()=>{
 const d=complete();d.project.scope=null;d.challenges=[issue()];
 const f=validateDeployment(d,context()).findings.find(f=>f.ruleId==='RP-010')!;
 d.review.waivers=[{...acknowledgment,id:'waiver',findingFingerprint:f.fingerprint,planningHash:planningHash(d),ruleId:'RP-010',evidenceIds:[]}];
 expect(validateDeployment(d,context()).findings.find(f=>f.ruleId==='RP-010')).toMatchObject({status:'active',waivable:false});
});
it('separates future requirements, external evidence and required local integrity',()=>{
 const d=complete();expect(validateDeployment(d,context()).findings.filter(f=>f.ruleId==='RP-060')).toEqual([]);
 const a=attachment();d.evidence.push(a);
 expect(validateDeployment(d,context([{evidenceId:a.id,state:'present',sha256:a.location.sha256,size:10}])).findings.filter(f=>f.ruleId==='RP-060')).toEqual([]);
 for(const state of ['missing','unreadable','mismatch'] as const) expect(validateDeployment(d,context([{evidenceId:a.id,state}])).findings.map(f=>f.ruleId)).toContain('RP-060');
});
it('requires local hash-matched planning support for required verification declarations',()=>{
 const d=complete(), a=attachment();d.evidence.push(a);d.kpis[0]!.verification=[{id:'verify',claimPath:'baseline',required:true,evidenceIds:[a.id],attestation:null}];
 expect(validateDeployment(d,context([{evidenceId:a.id,state:'present',sha256:a.location.sha256}])).findings.map(f=>f.ruleId)).not.toContain('RP-062');
 expect(validateDeployment(d,context([{evidenceId:a.id,state:'present',sha256:'0'.repeat(64)}])).findings.map(f=>f.ruleId)).toContain('RP-062');
 d.kpis[0]!.verification[0]!.required=false;expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).not.toContain('RP-062');
});
it('rejects wrong-kind and nested references without confusing historical review identifiers',()=>{
 const d=approved(complete());d.review.approvals[0]!.reviewerId='historical-person';d.review.approvals[0]!.evidenceIds=['historical-evidence'];d.review.currentApprovalId=null;
 expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).not.toContain('RP-003');
 d.workflows[0]!.steps=[{id:'step',title:'handoff',location:null,handoffToId:provided('requirement')}];
 expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).toContain('RP-003');
});
it('classifies unknown spec versions explicitly before the fixed-version schema',()=>expect(validateDeployment({...complete(),specVersion:'2.0.0'},context()).findings.map(f=>f.ruleId)).toContain('RP-004'));
it('keeps every minimum meaningful review container mandatory',()=>{
 const minimum=[['needs','RP-013'],['workflows','RP-020'],['kpis','RP-030'],['requirements','RP-042'],['acceptanceTests','RP-050']] as const;
 for(const [collection,id] of minimum){const d=complete();d[collection]=[];expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).toContain(id);}
 const d=complete();for(const key of ['problem','scope','outcome'] as const)d.project[key]={state:'unknown',note:'Not known'};
 expect(validateDeployment(d,context()).findings.filter(f=>f.ruleId==='RP-010')).toHaveLength(3);
});
it('reports malformed and duplicate nested stable IDs through RP-002',()=>{
 for(const id of ['', 'bad id']){const d=complete();d.needs[0]!.id=id;expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).toContain('RP-002');}
 const d=complete();d.workflows[0]!.steps=[{id:'person',title:'Step',location:null,handoffToId:null}];
 expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).toContain('RP-002');
});
it('does not let review bookkeeping or nested IDs satisfy authoring references',()=>{
 const d=approved(complete());d.needs[0]!.beneficiaryIds=['approval'];
 expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).toContain('RP-003');
 d.workflows[0]!.steps=[{id:'step',title:'Step',location:null,handoffToId:null}];d.needs[0]!.workflowIds=['step'];
 expect(validateDeployment(d,context()).findings.filter(f=>f.ruleId==='RP-003')).toHaveLength(2);
});
it('checks acceptance subject and evidence target purposes',()=>{
 const d=complete();d.acceptanceTests[0]!.subjectIds=['person'];d.evidence[0]!.purpose='planning';
 const report=validateDeployment(d,context());expect(report.findings.filter(f=>f.ruleId==='RP-003')).toHaveLength(2);expect(report.findings.map(f=>f.ruleId)).toContain('RP-051');
});
it('preserves meaningful false and zero and rejects reversed numeric ranges',()=>{
 const d=complete();expect(validateDeployment(d,context()).readiness).toBe('ready');
 d.acceptanceTests[0]!.criterion=provided({kind:'numeric',operator:'between',threshold:{value:'10',unit:'m',subject:'distance'},upper:{value:'1',unit:'m',subject:'distance'}});
 expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).toContain('RP-050');
});
it('allows reasoned not-applicable challenge responses and keeps hidden historical answers',()=>{
 const d=complete();d.challengeAnswers[3]!.answer={state:'not-applicable',reason:'One controlled receiver is always present'};
 d.challengeAnswers.push({...d.challengeAnswers[3]!,id:'old-prompt',promptId:'retired-prompt',answer:null});
 expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).not.toContain('RP-021');
});
it('does not apply known extension exemptions to malformed required capability declarations',()=>{
 const d=complete();d.extensions['robopomelo.capabilities']={required:'deployment-planning'};
 expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).toContain('RP-001');
 d.extensions['robopomelo.capabilities']={required:['deployment-planning']};expect(validateDeployment(d,context()).readiness).toBe('ready');
});
it('does not accept required support from external, future or decision-only evidence',()=>{
 const d=complete();d.kpis[0]!.verification=[{id:'verify',claimPath:'baseline',required:true,evidenceIds:['future-evidence'],attestation:null}];
 expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).toContain('RP-062');
 d.evidence[0]!.purpose='planning';d.evidence[0]!.location={kind:'external',uri:'https://example.com/support'};
 expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).toContain('RP-062');
});
it('does not invalidate warning fingerprints from array order alone',()=>{
 const d=complete();d.kpis[0]!.baseline=null;const old=validateDeployment(d,context()).findings.find(f=>f.ruleId==='RP-031')!;
 d.kpis.unshift({...d.kpis[0]!,id:'metric-2',baseline:provided({value:'1',unit:'count/h',subject:'pallet'})});
 const changed=validateDeployment(d,context()).findings.find(f=>f.ruleId==='RP-031')!;
 expect(changed.fingerprint).toBe(old.fingerprint);
});
