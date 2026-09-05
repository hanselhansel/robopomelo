import { expect, it } from 'vitest';
import { evaluateRestore } from '../src/restore.js';
import { evaluatePatch } from '../src/patches.js';
import { approvalStatus } from '../src/review-validity.js';
import { complete, approved, provided, issue } from './validation-fixtures.test.js';
import { mutationContext, patch } from './mutation-fixtures.js';
const request=()=>{const {formatVersion:_,operations:__,...input}=patch([]);return input;};
it('restores root extensions exactly under author authority',()=>{
 const current=complete(),target=complete();current.extensions['example.plan']={count:7};target.extensions['example.plan']={count:0,enabled:false,nested:['a','b']};
 const result=evaluateRestore(current,target,request(),mutationContext({scopes:['author']}));
 expect(result.deployment.extensions).toEqual(target.extensions);expect(result.deployment.extensions).not.toBe(target.extensions);
 expect(result.diff).toContainEqual({collection:'root',id:'project-1',field:'extensions',before:current.extensions,after:target.extensions});
 expect(current.extensions).toEqual({'example.plan':{count:7}});
});
it('preserves current review metadata rather than importing historical selections',()=>{
 const current=approved(complete()),target=complete();
 current.review.revocations=[{id:'revoke',approvalId:'approval',actor:{kind:'human',name:'person'},reason:'Withdrawn',source:'meeting',recordedAt:'2026-09-05T00:00:00Z'}];
 const result=evaluateRestore(current,target,request(),mutationContext());
 expect(result.deployment.review).toEqual(current.review);expect(approvalStatus(result.deployment,result.validation)).toBe('revoked');
});
it('cannot erase required obligations or accepted decisions under author scope',()=>{
 const current=complete(),target=complete();current.challenges=[{...issue(),requiredBeforeReview:true}];
 expect(()=>evaluateRestore(current,target,request(),mutationContext({scopes:['author']}))).toThrow(/scope/i);
 current.challenges=[];current.decisions=[{id:'decision',title:'Design decision',description:null,ownerId:null,sourceEvidenceIds:[],extensions:{},question:provided('Proceed?'),options:['Proceed'],rationale:provided('Reviewed'),state:'accepted',relatedIds:[],actor:{kind:'human',name:'person',source:'meeting'},decidedAt:'2026-09-05T00:00:00Z'}];
 expect(()=>evaluateRestore(current,target,request(),mutationContext({scopes:['author']}))).toThrow(/scope/i);
});
it('retains permanent invalidation when restoring the originally approved content',()=>{
 const original=approved(complete());const changed=evaluatePatch(original,patch([{op:'project',fields:{scope:{state:'provided',value:'Revised'}}}]),mutationContext());
 const result=evaluateRestore(changed.deployment,original,{...request(),baseRevision:'rev-2',baseHash:'b'.repeat(64)},mutationContext({sourceRevision:'rev-2',sourceHash:'b'.repeat(64),nextRevision:'rev-3'}));
 expect(result.deployment.project.scope).toEqual(original.project.scope);expect(result.deployment.review.invalidations).toEqual(changed.deployment.review.invalidations);expect(approvalStatus(result.deployment,result.validation)).toBe('stale');
});
it('validates target version, project identity, structure and references without changing either snapshot',()=>{
 const current=complete(),target=complete(),before=structuredClone(current);
 for(const bad of [{...target,specVersion:'2.0.0'}, {...target,project:{...target.project,id:'other'}}, {...target,rogue:true}])expect(()=>evaluateRestore(current,bad as typeof target,request(),mutationContext())).toThrow();
 target.needs[0]!.beneficiaryIds=['missing'];expect(()=>evaluateRestore(current,target,request(),mutationContext())).toThrow(/reference/i);expect(current).toEqual(before);
});
it('restores ordered flow steps exactly and uses the new injected revision',()=>{
 const current=complete(),target=complete();
 const steps=[{id:'step-a',title:'Collect',location:null,handoffToId:null},{id:'step-b',title:'Deliver',location:null,handoffToId:null}];current.workflows[0]!.steps=steps;target.workflows[0]!.steps=[...steps].reverse();
 const result=evaluateRestore(current,target,request(),mutationContext());expect(result.deployment.workflows[0]!.steps).toEqual(target.workflows[0]!.steps);expect(result.deployment.meta.revisionId).toBe('rev-2');expect(result.validation.sourceHash).toBeNull();
});
