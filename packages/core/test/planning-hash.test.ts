import { it, expect } from 'vitest';
import type { Deployment } from '@robopomelo/spec';
import { populated, base, approval } from '../../spec/test/fixtures.js';
import { planningHash } from '../src/planning-hash.js';
const sample = (): Deployment => structuredClone(populated);
it('ignores revision bookkeeping and review records but preserves authored meaning', () => {
  const a=sample(), b=sample();
  b.meta.revisionId='rev-2'; b.meta.updatedAt='2026-09-06T00:00:00Z';
  b.review.approvals.push(approval); b.review.currentApprovalId=approval.id;
  expect(planningHash(a)).toBe(planningHash(b));
  b.project.outcome={state:'provided',value:'A different outcome'};
  expect(planningHash(a)).not.toBe(planningHash(b));
});
it('sorts ID-keyed collections without mutating the caller', () => {
  const a=sample(); a.stakeholders.push({...base('another'),role:null,responsibilities:[]});
  const b=structuredClone(a); b.stakeholders.reverse();
  const before=JSON.stringify(b);
  expect(planningHash(a)).toBe(planningHash(b));
  expect(JSON.stringify(b)).toBe(before);
});
it('preserves ordered workflow steps and extension arrays', () => {
  const a=sample(); a.workflows[0]!.steps.push({id:'step-2',title:'Dispatch',location:null,handoffToId:null});
  const b=structuredClone(a); b.workflows[0]!.steps.reverse();
  expect(planningHash(a)).not.toBe(planningHash(b));
  b.workflows[0]!.steps.reverse(); a.extensions.acme=['first','second']; b.extensions.acme=['second','first'];
  expect(planningHash(a)).not.toBe(planningHash(b));
});
it('excludes decision-only evidence but retains planning support digests', () => {
  const a=sample(), b=sample();
  b.evidence.push({...base('decision-file'),purpose:'decision',required:false,relatedIds:[],provenance:null,location:{kind:'attachment',path:'evidence/decision.txt',sha256:'a'.repeat(64),size:4}});
  expect(planningHash(a)).toBe(planningHash(b));
  b.evidence.at(-1)!.purpose='planning';
  expect(planningHash(a)).not.toBe(planningHash(b));
});
it('includes decision-labeled evidence when a planning claim also depends on it',()=>{
 const a=sample();
 a.evidence.push({...base('shared-source'),purpose:'decision',required:false,relatedIds:[],provenance:null,location:{kind:'attachment',path:'evidence/shared.txt',sha256:'a'.repeat(64),size:4}});
 a.needs[0]!.sourceEvidenceIds=['shared-source'];
 const b=structuredClone(a);(b.evidence.at(-1)!.location as {sha256:string}).sha256='b'.repeat(64);
 expect(planningHash(a)).not.toBe(planningHash(b));
});
