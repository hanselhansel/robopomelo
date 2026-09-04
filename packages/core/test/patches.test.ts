import { expect, it } from 'vitest';
import type { Json, PatchOperation } from '@robopomelo/spec';
import { evaluatePatch } from '../src/patches.js';
import { complete, approved, provided, issue, attachment, context } from './validation-fixtures.test.js';
import { mutationContext, patch } from './mutation-fixtures.js';
import { approvalStatus } from '../src/review-validity.js';
import { validateDeployment } from '../src/validation.js';
const update=(fields:Record<string,Json>):PatchOperation=>({op:'update',collection:'kpis',id:'metric',fields});
it('rejects stale identities and preserves the original on every rejection',()=>{
 const d=complete(),before=structuredClone(d);
 for(const changed of [{baseRevision:'stale'},{baseHash:'b'.repeat(64)},{projectId:'other'}])expect(()=>evaluatePatch(d,patch([],changed),mutationContext())).toThrow(/stale|project/i);
 expect(()=>evaluatePatch(d,patch([update({baseline:null})]),mutationContext({scopes:['inspect']}))).toThrow(/scope/i);
 expect(d).toEqual(before);
});
it('accepts a schema-valid incomplete draft and returns candidate source hash null',()=>{
 const d=complete(),r=evaluatePatch(d,patch([{op:'project',fields:{outcome:null}}]),mutationContext());
 expect(r.deployment.project.outcome).toBeNull();expect(r.validation.readiness).toBe('blocked');expect(r.validation.sourceHash).toBeNull();
 expect(r.deployment.meta).toMatchObject({revisionId:'rev-2',parentRevisionId:'rev-1',updatedAt:'2026-09-05T01:00:00Z'});
 expect(r.diff).toContainEqual({collection:'project',id:d.project.id,field:'outcome',before:d.project.outcome,after:null});
 expect(d.project.outcome).not.toBeNull();
});
it('validates references after an atomic multi-record add',()=>{
 const d=complete();const n={...d.needs[0]!,id:'need-2',requirementIds:['requirement-2']};const r={...d.requirements[0]!,id:'requirement-2',needIds:['need-2']};
 const result=evaluatePatch(d,patch([{op:'add',collection:'needs',record:n as unknown as Json},{op:'add',collection:'requirements',record:r as unknown as Json}]),mutationContext());
 expect(result.deployment.needs.some(n=>n.id==='need-2')).toBe(true);
 expect(()=>evaluatePatch(d,patch([{op:'remove',collection:'requirements',id:'requirement'}]),mutationContext())).toThrow(/reference/i);
});
it('rejects unknown fields, immutable IDs and prototype-affecting updates',()=>{
 const d=complete();
 for(const fields of [{id:'new'}, {review:{}},JSON.parse('{"__proto__":{"polluted":true}}')])expect(()=>evaluatePatch(d,patch([update(fields)]),mutationContext())).toThrow();
 expect({}).not.toHaveProperty('polluted');
});
it('protects review obligations and enclosing record removal',()=>{
 const d=complete();d.challenges=[{...issue(),requiredBeforeReview:true}];
 const author=mutationContext({scopes:['author']});
 for(const op of [{op:'update',collection:'challenges',id:'issue',fields:{requiredBeforeReview:false}},{op:'remove',collection:'challenges',id:'issue'}] as PatchOperation[])expect(()=>evaluatePatch(d,patch([op]),author)).toThrow(/scope/i);
 expect(evaluatePatch(d,patch([{op:'remove',collection:'challenges',id:'issue'}]),mutationContext()).deployment.challenges).toEqual([]);
});
it('allows optional verification but protects obligations, attestations and record removal',()=>{
 const d=complete(),v={id:'verify',claimPath:'baseline',required:false,evidenceIds:[],attestation:null};
 expect(evaluatePatch(d,patch([update({verification:[v]})]),mutationContext({scopes:['author']})).deployment.kpis[0]!.verification).toEqual([v]);
 d.kpis[0]!.verification=[{...v,required:true}];
 for(const fields of [{verification:[]},{verification:[v]}])expect(()=>evaluatePatch(d,patch([update(fields)]),mutationContext({scopes:['author']}))).toThrow(/scope/i);
 expect(()=>evaluatePatch(d,patch([{op:'remove',collection:'kpis',id:'metric'}]),mutationContext({scopes:['author']}))).toThrow(/scope/i);
});
it('requires evidence scope and a safe allocated attachment location',()=>{
 const d=complete(),a=attachment();
 expect(()=>evaluatePatch(d,patch([{op:'add',collection:'evidence',record:a as unknown as Json}]),mutationContext({scopes:['author']}))).toThrow(/scope/i);
 const unsafe={...a,location:{...a.location,path:'../secret'}};
 expect(()=>evaluatePatch(d,patch([{op:'add',collection:'evidence',record:unsafe as unknown as Json}]),mutationContext())).toThrow(/path/i);
 expect(evaluatePatch(d,patch([{op:'add',collection:'evidence',record:a as unknown as Json}]),mutationContext()).deployment.evidence).toHaveLength(2);
});
it('protects accepted decisions, decision evidence and attestation changes',()=>{
 const d=complete();d.decisions=[{...issue(),id:'decision',question:provided('Proceed?'),options:['Proceed'],rationale:provided('Reviewed'),state:'accepted',relatedIds:[],actor:{kind:'human',name:'person',source:'meeting'},decidedAt:'2026-09-05T00:00:00Z'}] as unknown as typeof d.decisions;
 // Use a schema-shaped decision rather than inheriting issue-only fields.
 const decision=d.decisions[0]!;for(const key of ['statement','nextAction','status','resolution','requiredBeforeReview'])delete (decision as unknown as Record<string,unknown>)[key];
 expect(()=>evaluatePatch(d,patch([{op:'remove',collection:'decisions',id:'decision'}]),mutationContext({scopes:['author']}))).toThrow(/scope/i);
 const a={...attachment(),purpose:'decision'};
 expect(()=>evaluatePatch(complete(),patch([{op:'add',collection:'evidence',record:a as unknown as Json}]),mutationContext({scopes:['author','evidence']}))).toThrow(/scope/i);
});
it('persists approval invalidations through edit, revert, and serialized reopen',()=>{
 const d=approved(complete()),old=d.project.scope;
 const first=evaluatePatch(d,patch([{op:'project',fields:{scope:provided('Changed scope') as Json}}]),mutationContext());
 expect(first.invalidatedApprovalIds).toEqual(['approval']);expect(first.deployment.review.currentApprovalId).toBe('approval');
 const reopened=JSON.parse(JSON.stringify(first.deployment));
 const second=evaluatePatch(reopened,patch([{op:'project',fields:{scope:old as Json}}],{baseRevision:'rev-2',baseHash:'b'.repeat(64)}),mutationContext({sourceRevision:'rev-2',sourceHash:'b'.repeat(64),nextRevision:'rev-3'}));
 expect(second.deployment.review.invalidations).toHaveLength(1);expect(approvalStatus(second.deployment,second.validation)).toBe('stale');
});
it('preserves observed evidence invalidity on the next authorized mutation',()=>{
 const d=complete();d.evidence.push(attachment());approved(d);
 const result=evaluatePatch(d,patch([]),mutationContext());
 expect(result.deployment.review.invalidations.map(i=>i.reason)).toContain('required-evidence-changed');
 expect(validateDeployment(d,context()).readiness).toBe('blocked');expect(d.review.invalidations).toEqual([]);
});
it('never invalidates for an unchanged authored value or false criterion',()=>{
 const d=approved(complete());
 const result=evaluatePatch(d,patch([{op:'update',collection:'acceptanceTests',id:'test',fields:{criterion:provided({kind:'boolean',expected:false}) as Json}}]),mutationContext());
 expect(result.invalidatedApprovalIds).toEqual([]);expect(result.deployment.review.invalidations).toEqual([]);
});
it('supports schema-declared advanced fields under their required authority',()=>{
 const d=complete();d.evidence.push(attachment());
 const updated=evaluatePatch(d,patch([{op:'update',collection:'evidence',id:'planning-evidence',fields:{location:{kind:'attachment',path:'evidence/replacement.txt',sha256:'c'.repeat(64),size:8}}}]),mutationContext());
 expect(updated.deployment.evidence[1]!.location).toMatchObject({path:'evidence/replacement.txt'});
 const proposed={...d.requirements[0]!,id:'decision',question:provided('Approve this design?'),options:['Proceed'],rationale:provided('Meets the stated constraints'),state:'proposed',relatedIds:[],actor:null,decidedAt:null};
 for(const key of ['capability','constraints','needIds','workflowIds','kpiIds','testIds','verificationDisposition'])delete (proposed as Record<string,unknown>)[key];
 d.decisions=[proposed as unknown as typeof d.decisions[number]];
 const accepted=evaluatePatch(d,patch([{op:'update',collection:'decisions',id:'decision',fields:{state:'accepted',actor:{kind:'human',name:'person',source:'review meeting'},decidedAt:'2026-09-05T01:00:00Z'}}]),mutationContext());
 expect(accepted.deployment.decisions[0]!.state).toBe('accepted');
});
it('rejects verification support that refers to future or decision-only records even when optional',()=>{
 const d=complete();
 expect(()=>evaluatePatch(d,patch([update({verification:[{id:'verify',claimPath:'baseline',required:false,evidenceIds:['future-evidence'],attestation:null}]})]),mutationContext())).toThrow(/reference/i);
});
it('cannot smuggle protected states through multi-operation removal or replacement',()=>{
 const d=complete();d.challenges=[{...issue(),requiredBeforeReview:true}];
 expect(()=>evaluatePatch(d,patch([{op:'update',collection:'challenges',id:'issue',fields:{requiredBeforeReview:false}},{op:'remove',collection:'challenges',id:'issue'}]),mutationContext({scopes:['author']}))).toThrow(/scope/i);
 expect(d.challenges[0]!.requiredBeforeReview).toBe(true);
});
it('protects removal of an optional but attested declaration',()=>{
 const d=complete();d.kpis[0]!.verification=[{id:'verify',claimPath:'baseline',required:false,evidenceIds:[],attestation:{actor:{kind:'human',name:'person'},statement:'I checked the observation',recordedAt:'2026-09-05T00:00:00Z',source:'review meeting'}}];
 expect(()=>evaluatePatch(d,patch([update({verification:[]})]),mutationContext({scopes:['author']}))).toThrow(/scope/i);
});
it('does not grant agents protected-authority without an explicit human delegation',()=>{
 const d=complete();d.challenges=[{...issue(),requiredBeforeReview:true}];
 expect(()=>evaluatePatch(d,patch([{op:'remove',collection:'challenges',id:'issue'}],{actor:{kind:'agent',name:'Assistant'}}),mutationContext())).toThrow(/delegation/i);
});
it('rejects duplicate IDs across collections and leaves the source intact',()=>{
 const d=complete();const before=structuredClone(d);
 expect(()=>evaluatePatch(d,patch([{op:'add',collection:'needs',record:{...d.needs[0]!,id:'person'} as unknown as Json}]),mutationContext())).toThrow();expect(d).toEqual(before);
});
