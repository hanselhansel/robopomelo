import { expect, it } from 'vitest';
import { type Approval } from '@robopomelo/spec';
import { evaluateReview } from '../src/reviews.js';
import { complete, approved, provided, context } from './validation-fixtures.test.js';
import { mutationContext, recorder, review } from './mutation-fixtures.js';
import { planningHash } from '../src/planning-hash.js';
import { validateDeployment } from '../src/validation.js';
import { approvalStatus } from '../src/review-validity.js';
import { acknowledgment } from '../../spec/test/fixtures.js';
const approval=(d=complete()):Approval=>({id:'new-approval',reviewerId:'person',reviewerName:'person',recorder,reviewerRole:'Operator',decision:'approved',decidedAt:'2026-09-05T01:00:00Z',source:'review meeting',sourceRevision:'rev-1',sourceHash:'a'.repeat(64),planningHash:planningHash(d),ruleSetVersion:'1.0.0',acknowledgmentIds:[],waiverIds:[],evidenceIds:[]});
it('records exact explicitly supplied approval under decision scope',()=>{
 const d=complete();const result=evaluateReview(d,review({action:'approve',record:approval(d)}),mutationContext({scopes:['record-decisions']}));
 expect(approvalStatus(result.deployment,result.validation)).toBe('current');expect(result.deployment.review.currentApprovalId).toBe('new-approval');expect(result.validation.sourceHash).toBeNull();expect(d.review.approvals).toEqual([]);
});
it('rejects missing scope and stale reviewed identities without mutation',()=>{
 const d=complete(),before=structuredClone(d);
 expect(()=>evaluateReview(d,review({action:'approve',record:approval(d)}),mutationContext({scopes:['author']}))).toThrow(/scope/i);
 for(const changed of [{sourceHash:'b'.repeat(64)},{sourceRevision:'old'},{planningHash:'c'.repeat(64)},{ruleSetVersion:'0.1.0'}])expect(()=>evaluateReview(d,review({action:'approve',record:{...approval(d),...changed}}),mutationContext())).toThrow(/reviewed|stale/i);
 expect(d).toEqual(before);
});
it('requires actual designated approver and complete supplied provenance',()=>{
 const d=complete();
 for(const changed of [{reviewerId:'missing'},{reviewerName:'Invented'},{source:' '},{recorder:{kind:'human' as const,name:'Other'}}])expect(()=>evaluateReview(d,review({action:'approve',record:{...approval(d),...changed}}),mutationContext())).toThrow();
});
it('blocks approval with blockers while allowing rejected and changes-requested decisions',()=>{
 const d=complete();d.project.scope=null;
 expect(()=>evaluateReview(d,review({action:'approve',record:approval(d)}),mutationContext())).toThrow(/blocked/i);
 for(const decision of ['rejected','changes-requested'] as const){const result=evaluateReview(d,review({action:'approve',record:{...approval(d),decision}}),mutationContext());expect(approvalStatus(result.deployment,result.validation)).toBe(decision);}
});
it('replaces stale current approval without an RP-080 acknowledgment loop',()=>{
 const d=approved(complete());d.project.scope=provided('Revised scope');
 const result=evaluateReview(d,review({action:'approve',record:approval(d)}),mutationContext());
 expect(approvalStatus(result.deployment,result.validation)).toBe('current');expect(result.deployment.review.approvals).toHaveLength(2);expect(result.deployment.review.invalidations.map(i=>i.approvalId)).toContain('approval');
});
it('requires bindings to unrelated warnings when replacing a stale decision',()=>{
 const d=approved(complete());d.kpis[0]!.baseline=null;
 expect(()=>evaluateReview(d,review({action:'approve',record:approval(d)}),mutationContext())).toThrow(/warning/i);
 const f=validateDeployment(d,context()).findings.find(f=>f.ruleId==='RP-031')!;
 const ack={...acknowledgment,actor:recorder,source:'review meeting',planningHash:planningHash(d),findingFingerprint:f.fingerprint};
 d.review.acknowledgments=[ack];
 const result=evaluateReview(d,review({action:'approve',record:{...approval(d),acknowledgmentIds:[ack.id]}}),mutationContext());expect(approvalStatus(result.deployment,result.validation)).toBe('current');
});
it('records only applicable exact warning acknowledgments and eligible waivers',()=>{
 const d=complete();d.kpis[0]!.baseline=null;const f=validateDeployment(d,context()).findings.find(f=>f.ruleId==='RP-031')!;
 const ack={...acknowledgment,actor:recorder,source:'review meeting',planningHash:planningHash(d),findingFingerprint:f.fingerprint};
 expect(evaluateReview(d,review({action:'acknowledge',records:[ack]}),mutationContext()).validation.counts.unacknowledged).toBe(0);
 expect(()=>evaluateReview(d,review({action:'acknowledge',records:[{...ack,findingFingerprint:'0'.repeat(64)}]}),mutationContext())).toThrow(/finding/i);
 expect(evaluateReview(d,review({action:'waive',record:{...ack,id:'waiver',ruleId:'RP-031',evidenceIds:[]}}),mutationContext()).validation.counts.waived).toBe(1);
 d.project.scope=null;const blocker=validateDeployment(d,context()).findings.find(f=>f.ruleId==='RP-010')!;
 expect(()=>evaluateReview(d,review({action:'waive',record:{...ack,id:'waiver',planningHash:planningHash(d),findingFingerprint:blocker.fingerprint,ruleId:'RP-010',evidenceIds:[]}}),mutationContext())).toThrow(/waiv/i);
});
it('rejects duplicate review IDs and dangling decision evidence',()=>{
 const d=complete();d.review.approvals=[approval(d)];
 expect(()=>evaluateReview(d,review({action:'approve',record:approval(d)}),mutationContext())).toThrow(/ID|duplicate/i);
 expect(()=>evaluateReview(complete(),review({action:'approve',record:{...approval(),evidenceIds:['missing']}}),mutationContext())).toThrow(/evidence/i);
});
it('requires delegated human identity and source when an agent records a decision',()=>{
 const d=complete(),agent={kind:'agent' as const,name:'Assistant'};
 expect(()=>evaluateReview(d,review({action:'approve',record:{...approval(d),recorder:agent}},{actor:agent}),mutationContext())).toThrow(/delegation|provenance/i);
 const delegated={...agent,onBehalfOf:'person',source:'review meeting'};
 expect(approvalStatus(...(()=>{const r=evaluateReview(d,review({action:'approve',record:{...approval(d),recorder:delegated}},{actor:delegated}),mutationContext());return [r.deployment,r.validation] as const;})())).toBe('current');
});
it('revokes a selected approval with supplied provenance and preserves history',()=>{
 const d=approved(complete());const record={id:'revocation',approvalId:'approval',actor:recorder,reason:'New constraint',source:'review meeting',recordedAt:'2026-09-05T01:00:00Z'};
 const r=evaluateReview(d,review({action:'revoke',record}),mutationContext());expect(approvalStatus(r.deployment,r.validation)).toBe('revoked');expect(r.deployment.review.approvals).toEqual(d.review.approvals);
});
it('never uses a globally present waiver that the new approval does not name',()=>{
 const d=complete();d.kpis[0]!.baseline=null;const f=validateDeployment(d,context()).findings.find(f=>f.ruleId==='RP-031')!;
 d.review.waivers=[{...acknowledgment,id:'waiver',actor:recorder,source:'review meeting',planningHash:planningHash(d),findingFingerprint:f.fingerprint,ruleId:'RP-031',evidenceIds:[]}];
 expect(()=>evaluateReview(d,review({action:'approve',record:approval(d)}),mutationContext())).toThrow(/warning/i);
 const result=evaluateReview(d,review({action:'approve',record:{...approval(d),waiverIds:['waiver']}}),mutationContext());expect(approvalStatus(result.deployment,result.validation)).toBe('current');
});
it('does not accept stale warning bindings or partial batches',()=>{
 const d=complete();d.kpis[0]!.baseline=null;const f=validateDeployment(d,context()).findings.find(f=>f.ruleId==='RP-031')!;
 const ack={...acknowledgment,actor:recorder,source:'review meeting',planningHash:planningHash(d),findingFingerprint:f.fingerprint};
 const before=structuredClone(d);
 expect(()=>evaluateReview(d,review({action:'acknowledge',records:[ack,{...ack,id:'ack-2',findingFingerprint:'c'.repeat(64)}]}),mutationContext())).toThrow();expect(d).toEqual(before);
 expect(()=>evaluateReview(d,review({action:'acknowledge',records:[{...ack,planningHash:'d'.repeat(64)}]}),mutationContext())).toThrow(/stale/i);
});
it('permits a fresh replacement after revocation while keeping the old decision revoked',()=>{
 const d=approved(complete());d.review.revocations=[{id:'revocation',approvalId:'approval',actor:recorder,reason:'Withdrawn',source:'review meeting',recordedAt:'2026-09-05T00:30:00Z'}];
 const result=evaluateReview(d,review({action:'approve',record:approval(d)}),mutationContext());expect(approvalStatus(result.deployment,result.validation)).toBe('current');
 result.deployment.review.currentApprovalId='approval';expect(approvalStatus(result.deployment,validateDeployment(result.deployment,context()))).toBe('revoked');
});
it('does not fabricate review identity from the command actor',()=>{
 const d=complete();const missing={...approval(d),reviewerName:''};
 expect(()=>evaluateReview(d,review({action:'approve',record:missing}),mutationContext())).toThrow();expect(missing.reviewerName).toBe('');
});
