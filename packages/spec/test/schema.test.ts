import { describe, expect, it } from 'vitest';
import { checkSchema, schemas } from '../src/index.js';
import type { Deployment, PatchEnvelope, ReviewCommand, Knowledge, Criterion, Json } from '../src/index.js';
import { blank, populated, kpi, actor, hash, acknowledgment, approval, envelope } from './fixtures.js';
import { Ajv2020 } from 'ajv/dist/2020.js';

describe('closed deployment contract', () => {
  it('accepts a blank draft and all authored record variants', () => {
    expect(checkSchema(blank)).toEqual([]);
    expect(checkSchema(populated)).toEqual([]);
  });
  it('accepts only valid locally bundled 2020-12 schemas', () => {
    const ajv = new Ajv2020({strict:true});
    for (const schema of schemas) expect(ajv.validateSchema(schema)).toBe(true);
  });
  it('keeps missing, unknown, unverified, not-applicable and zero distinct', () => {
    const states: Knowledge<{value:string;unit:string;subject:string}>[] = [null,{state:'unknown',note:'Not measured'},{state:'unverified',value:{value:'0',unit:'count/h',subject:'pallet'}},{state:'not-applicable',reason:'No baseline'},{state:'provided',value:{value:'0',unit:'count/h',subject:'pallet'}}];
    for (const baseline of states) expect(checkSchema({...blank,kpis:[kpi({baseline})]})).toEqual([]);
    expect(new Set(states.map(value => JSON.stringify(value))).size).toBe(5);
  });
  it('rejects unregistered properties at every core level', () => {
    for (const value of [{...blank,surprise:true},{...blank,project:{...blank.project,surprise:true}},{...blank,kpis:[{...kpi(),surprise:true}]},{...blank,kpis:[kpi({baseline:{state:'unknown',note:'x',surprise:true} as never})]}]) expect(checkSchema(value).length).toBeGreaterThan(0);
  });
  it('preserves namespaced JSON extensions and rejects malformed keys', () => {
    expect(checkSchema({...blank,extensions:{'acme.geometry':{zero:0,flag:false,missing:null,items:['001']}}})).toEqual([]);
    expect(checkSchema({...blank,extensions:{'not a namespace':{}}}).length).toBeGreaterThan(0);
  });
  it.each(['', '-bad', 'a/b', 'a'.repeat(129)])('rejects malformed ID %s', id => {
    expect(checkSchema({...blank,project:{...blank.project,id}}).length).toBeGreaterThan(0);
  });
  it.each(['1e3','NaN','+1','01','1.',' 1','1'.repeat(129),1])('rejects malformed quantity %s', value => {
    expect(checkSchema({...blank,kpis:[kpi({target:{state:'provided',value:{value,unit:'m',subject:'distance'}} as never})]}).length).toBeGreaterThan(0);
  });
  it('rejects malformed references while leaving existence to core', () => {
    expect(checkSchema({...blank,kpis:[kpi({needIds:['missing-but-syntactic']})]})).toEqual([]);
    for (const needIds of [['bad/id'],[42],{id:'need'}]) expect(checkSchema({...blank,kpis:[{...kpi(),needIds}]}).length).toBeGreaterThan(0);
  });
  it('accepts every criterion variant including false and zero', () => {
    const criteria: Criterion[] = [{kind:'boolean',expected:false},{kind:'categorical',expected:['pass']},{kind:'numeric',operator:'gte',threshold:{value:'0',unit:'m',subject:'distance'}},{kind:'numeric',operator:'between',threshold:{value:'0',unit:'m',subject:'distance'},upper:{value:'1',unit:'m',subject:'distance'}}];
    for (const value of criteria) expect(checkSchema({...populated,acceptanceTests:[{...populated.acceptanceTests[0],criterion:{state:'provided',value}}]})).toEqual([]);
    expect(checkSchema({...populated,acceptanceTests:[{...populated.acceptanceTests[0],criterion:{state:'provided',value:{kind:'boolean',expected:0}}}]}).length).toBeGreaterThan(0);
  });
  it('validates all evidence locations and rejects mixed variants', () => {
    for (const location of [{kind:'attachment',path:'evidence/file.txt',sha256:hash,size:0},{kind:'external',uri:'https://example.com/evidence'},{kind:'future',description:'Pending'}]) expect(checkSchema({...populated,evidence:[{...populated.evidence[0],location}]})).toEqual([]);
    expect(checkSchema({...populated,evidence:[{...populated.evidence[0],location:{kind:'future',description:'Pending',path:'file'}}]}).length).toBeGreaterThan(0);
  });
  it('validates exact verification fields and known claim paths per record', () => {
    const verification = [{id:'verify',claimPath:'target',required:false,evidenceIds:[],attestation:null}];
    expect(checkSchema({...blank,kpis:[kpi({verification})]})).toEqual([]);
    expect(checkSchema({...blank,kpis:[kpi({verification:[{...verification[0]!,attestation:{actor,statement:'Inspected',recordedAt:'2026-09-05T00:00:00Z',source:'local'}}]})]})).toEqual([]);
    for (const claimPath of ['review.approvals','verification','target.value','missing']) expect(checkSchema({...blank,kpis:[kpi({verification:[{...verification[0]!,claimPath}]})]}).length).toBeGreaterThan(0);
  });
  it('validates review records including append-only invalidation structure', () => {
    const deployment = {...blank,review:{currentApprovalId:'approval',acknowledgments:[acknowledgment],waivers:[{...acknowledgment,id:'waiver',ruleId:'RP-012',evidenceIds:[]}],approvals:[approval],revocations:[{id:'revoke',approvalId:'approval',actor,reason:'Withdrawn',source:'local',recordedAt:'2026-09-05T00:00:00Z'}],invalidations:[{id:'invalidation',approvalId:'approval',revisionId:'rev-2',recordedAt:'2026-09-05T00:00:00Z',reason:'planning-content-changed'}]}} satisfies Deployment;
    expect(checkSchema(deployment)).toEqual([]);
    expect(checkSchema({...deployment,review:{...deployment.review,invalidations:[{...deployment.review.invalidations[0],actor}]}}).length).toBeGreaterThan(0);
  });
});

describe('closed mutation contracts', () => {
  it('validates every collection add/update/remove and project fields', () => {
    const collections = ['stakeholders','needs','problems','workflows','challenges','risks','assumptions','kpis','requirements','acceptanceTests','evidence','decisions','challengeAnswers'] as const;
    for (const collection of collections) {
      const patch = {...envelope,operations:[{op:'add',collection,record:JSON.parse(JSON.stringify(populated[collection][0])) as Json},{op:'update',collection,id:populated[collection][0]!.id,fields:{title:'Changed'}},{op:'remove',collection,id:populated[collection][0]!.id},{op:'project',fields:{name:'Changed'}}]} satisfies PatchEnvelope;
      expect(checkSchema(patch,'patch')).toEqual([]);
    }
  });
  it('rejects unknown collections, mutable IDs, malformed fields and mismatched records', () => {
    for (const operation of [{op:'add',collection:'kpis',record:populated.stakeholders[0]},{op:'update',collection:'kpis',id:'kpi-1',fields:{id:'new'}},{op:'update',collection:'kpis',id:'kpi-1',fields:{target:42}},{op:'remove',collection:'review',id:'approval'},{op:'project',fields:{review:{}}}]) expect(checkSchema({...envelope,operations:[operation]},'patch').length).toBeGreaterThan(0);
  });
  it('validates every review command variant', () => {
    const inputs: ReviewCommand['input'][] = [{action:'acknowledge',records:[acknowledgment]},{action:'waive',record:{...acknowledgment,ruleId:'RP-012',evidenceIds:[]}},{action:'approve',record:approval},{action:'revoke',record:{id:'revoke',approvalId:'approval',actor,reason:'Withdrawn',source:'local',recordedAt:'2026-09-05T00:00:00Z'}}];
    for (const input of inputs) expect(checkSchema({...envelope,input},'review')).toEqual([]);
    expect(checkSchema({...envelope,input:{action:'approve',record:acknowledgment}},'review').length).toBeGreaterThan(0);
  });
  it('rejects unsupported versions and malformed base identities', () => {
    expect(checkSchema({...blank,specVersion:'2.0.0'}).length).toBeGreaterThan(0);
    expect(checkSchema({...envelope,baseHash:'not-a-hash',operations:[]},'patch').length).toBeGreaterThan(0);
  });
});
it('permits an optional declared Skill capability on patches only',()=>{
 const general={...envelope,operations:[]};
 expect(checkSchema(general,'patch')).toEqual([]);
 expect(checkSchema({...general,capabilityId:'frame-robot-deployment'},'patch')).toEqual([]);
 for(const capabilityId of ['',42,'bad/id'])expect(checkSchema({...general,capabilityId},'patch').length).toBeGreaterThan(0);
 expect(checkSchema({...envelope,capabilityId:'frame-robot-deployment',input:{action:'approve',record:approval}},'review').length).toBeGreaterThan(0);
});
