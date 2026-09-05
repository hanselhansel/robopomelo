import { it, expect } from 'vitest';
import type { Deployment, ValidationReport } from '@robopomelo/spec';
import { populated } from '../../spec/test/fixtures.js';
import { reviewDocument } from '../src/review-document.js';
import { traceability } from '../src/traceability.js';
const report:ValidationReport={readiness:'blocked',label:'Specification blocked',findings:[],counts:{blockers:1,warnings:0,waived:0,unacknowledged:0},sourceRevision:'rev-1',sourceHash:'a'.repeat(64),toolVersion:'1.0.0-rc.1',specVersion:'1.0.0',ruleSetVersion:'1.0.0'};
it('produces plain readable text with uncertainty and all planning sections',()=>{
  const d:Deployment=structuredClone(populated);
  d.project.name='Receiving <draft> & review';
  d.kpis[0]!.baseline={state:'unknown',note:'Not measured'};
  const doc=reviewDocument(d,report);
  expect(doc.title).toBe('Receiving <draft> & review');
  expect(doc.sections.map(s=>s.id)).toContain('risks');
  expect(doc.sections.map(s=>s.id)).toContain('acceptanceTests');
  expect(JSON.stringify(doc)).toContain('Unknown: Not measured');
  expect(JSON.stringify(doc)).toContain('Specification blocked');
  expect(JSON.stringify(doc)).not.toMatch(/&lt;|&amp;/);
});
it('traces declared needs through flows requirements tests and evidence',()=>{
  const d:Deployment=structuredClone(populated);
  d.kpis[0]!.needIds=['need'];
  const row=traceability(d).find(r=>r.needId==='need')!;
  expect(row.workflowIds).toEqual(['flow']);
  expect(row.requirementIds).toEqual(['requirement']);
  expect(row.testIds).toEqual(['test']);
  expect(row.evidenceIds).toEqual(['evidence']);
  expect(row.kpiIds).toEqual(['kpi-1']);
});
it('does not credit an unrelated acceptance test as requirement coverage',()=>{
  const d:Deployment=structuredClone(populated);
  d.requirements[0]!.testIds=[];d.acceptanceTests[0]!.subjectIds=[];
  expect(traceability(d)[0]!.testIds).toEqual([]);
});
it('keeps acknowledgments revocations and invalidations readable in the review',()=>{
  const d:Deployment=structuredClone(populated);
  d.review.acknowledgments.push({id:'ack',findingFingerprint:'a'.repeat(64),planningHash:'b'.repeat(64),actor:{kind:'human',name:'Alex'},reason:'Baseline collection scheduled',recordedAt:'2026-09-05T00:00:00Z',source:'Meeting notes'});
  d.review.revocations.push({id:'revoke',approvalId:'approval',actor:{kind:'human',name:'Alex'},reason:'Scope changed',source:'Meeting',recordedAt:'2026-09-05T00:00:00Z'});
  expect(JSON.stringify(reviewDocument(d,report))).toContain('Baseline collection scheduled');
  expect(JSON.stringify(reviewDocument(d,report))).toContain('Scope changed');
});
