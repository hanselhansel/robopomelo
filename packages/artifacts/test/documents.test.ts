import { it, expect } from 'vitest';
import type { ProjectSnapshot } from '@robopomelo/spec';
import { populated } from '../../spec/test/fixtures.js';
import { sha256, planningHash } from '@robopomelo/core';
import { generateArtifacts } from '../src/index.js';
const source=JSON.stringify(populated,null,2)+'\n';
const snapshot:ProjectSnapshot={deployment:populated,sourceRevision:'rev-1',sourceHash:sha256(source),planningHash:planningHash(populated),validation:{readiness:'blocked',label:'Specification blocked',findings:[],counts:{blockers:1,warnings:0,waived:0,unacknowledged:0},sourceRevision:'rev-1',sourceHash:sha256(source),toolVersion:'1.0.0-rc.1',specVersion:'1.0.0',ruleSetVersion:'1.0.0'},approvalStatus:'none',approvalDetails:{status:'none',decisionId:null,reasons:[]},evidenceObservations:[]};
it('emits all required review members with exact source and provenance',()=>{
 const result=generateArtifacts({source,snapshot,selectedEvidenceIds:[]});
 expect(result.members.map(m=>m.path)).toEqual(['deployment.yaml','deployment-brief.md','acceptance-plan.md','validation-report.json','review.html','engineering-handoff.md','manifest.json']);
 expect(new TextDecoder().decode(result.members[0]!.bytes)).toBe(source);
 for(const file of result.members.slice(1))expect(new TextDecoder().decode(file.bytes)).toContain(snapshot.sourceHash);
});
it('keeps generated HTML inert and preserves visible hostile text',()=>{
 const s=structuredClone(snapshot);s.deployment.project.name='<script>alert(1)</script> & review';
 const changedSource=JSON.stringify(s.deployment); s.sourceHash=sha256(changedSource); s.planningHash=planningHash(s.deployment); s.validation.sourceHash=s.sourceHash;
 const result=generateArtifacts({source:changedSource,snapshot:s,selectedEvidenceIds:[]});
 const html=new TextDecoder().decode(result.members.find(m=>m.path==='review.html')!.bytes);
 expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
 expect(html).not.toMatch(/https?:\/\//);expect(html).toContain('Specification blocked');
});
it('uses stable payload bytes and hashes every member except the manifest itself',()=>{
 const a=generateArtifacts({source,snapshot,selectedEvidenceIds:[]});
 const b=generateArtifacts({source,snapshot,selectedEvidenceIds:[]});
 expect(a).toEqual(b);
 const manifest=JSON.parse(new TextDecoder().decode(a.members.at(-1)!.bytes));
 expect(manifest.members).toHaveLength(6);
 for(const row of manifest.members){const actual=a.members.find(m=>m.path===row.path)!;expect(row.sha256).toBe(sha256(actual.bytes));expect(row.size).toBe(actual.bytes.byteLength);}
 expect(manifest.evidence[0].disposition).toBe('future');
});
it('rejects stale source identities and unknown evidence selections',()=>{
 expect(()=>generateArtifacts({source:'changed',snapshot,selectedEvidenceIds:[]})).toThrow(/source/i);
 expect(()=>generateArtifacts({source,snapshot,selectedEvidenceIds:['missing']})).toThrow(/evidence/i);
});
it('plans explicitly selected evidence and rejects unsafe archive names',()=>{
 const d=structuredClone(snapshot.deployment);
 d.evidence=[{...d.evidence[0]!,id:'file-1',purpose:'planning',location:{kind:'attachment',path:'evidence/photo.txt',sha256:'b'.repeat(64),size:5}}];
 const bytes=JSON.stringify(d);const s={...snapshot,deployment:d,sourceHash:sha256(bytes),planningHash:planningHash(d),validation:{...snapshot.validation,sourceHash:sha256(bytes)},evidenceObservations:[{evidenceId:'file-1',state:'present' as const,sha256:'b'.repeat(64),size:5,checkedAt:'2026-09-05T00:00:00Z'}]};
 const plan=generateArtifacts({source:bytes,snapshot:s,selectedEvidenceIds:['file-1']});
 expect(plan.attachments[0]?.path).toBe('evidence/photo.txt');
 (d.evidence[0]!.location as {path:string}).path='../escape.txt';
 const changed=JSON.stringify(d);s.sourceHash=sha256(changed);s.planningHash=planningHash(d);s.validation.sourceHash=s.sourceHash;
 expect(()=>generateArtifacts({source:changed,snapshot:s,selectedEvidenceIds:['file-1']})).toThrow(/path/i);
});
