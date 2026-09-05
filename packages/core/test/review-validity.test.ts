import { expect, it } from 'vitest';
import { validateDeployment } from '../src/validation.js';
import { approvalDetails, approvalStatus } from '../src/review-validity.js';
import { complete, context, approved, provided, attachment } from './validation-fixtures.test.js';
it('shares the assessor for status and details without recursive validation',()=>{
 const d=approved(complete()), report=validateDeployment(d,context());
 expect(approvalStatus(d,report)).toBe('current');expect(approvalDetails(d,report)).toMatchObject({status:'current',decisionId:'approval',reasons:[]});
 d.review.currentApprovalId=null;expect(approvalStatus(d,validateDeployment(d,context()))).toBe('none');
});
it('never reactivates durable invalidation after planning content is restored',()=>{
 const d=approved(complete());d.review.invalidations=[{id:'invalidated',approvalId:'approval',revisionId:'rev-2',recordedAt:'2026-09-05T00:00:00Z',reason:'planning-content-changed'}];
 expect(approvalStatus(d,validateDeployment(d,context()))).toBe('stale');
 expect(approvalDetails(d,validateDeployment(d,context())).reasons.map(r=>r.code)).toContain('planning-content-changed');
});
it('marks only the selected decision stale and preserves historical approvals',()=>{
 const d=approved(complete());d.project.scope=provided('Changed');
 expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).toContain('RP-080');
 d.review.currentApprovalId=null;expect(validateDeployment(d,context()).findings.map(f=>f.ruleId)).not.toContain('RP-080');
});
it('honors revocation and negative decisions',()=>{
 const d=approved(complete());d.review.revocations=[{id:'revocation',approvalId:'approval',actor:{kind:'human',name:'Reviewer'},reason:'Withdrawn',source:'meeting',recordedAt:'2026-09-05T00:00:00Z'}];
 expect(approvalStatus(d,validateDeployment(d,context()))).toBe('revoked');
 d.review.revocations=[];
 for(const decision of ['rejected','changes-requested'] as const){d.review.approvals[0]!.decision=decision;expect(approvalStatus(d,validateDeployment(d,context()))).toBe(decision);}
});
it('identifies rule and required-evidence changes',()=>{
 const d=complete();d.evidence.push(attachment());approved(d);
 let report=validateDeployment(d,context());expect(approvalDetails(d,report).reasons.map(r=>r.code)).toContain('required-evidence-changed');
 d.review.approvals[0]!.ruleSetVersion='0.1.0';report=validateDeployment(d,context());expect(approvalDetails(d,report).reasons.map(r=>r.code)).toContain('rule-context-changed');
});
it('requires selected approval to name valid warning decisions',()=>{
 const d=complete();d.kpis[0]!.baseline=null;approved(d);
 expect(approvalStatus(d,validateDeployment(d,context()))).toBe('stale');
});
