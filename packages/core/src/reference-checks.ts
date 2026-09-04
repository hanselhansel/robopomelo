import type { Deployment } from '@robopomelo/spec';
import type { ReferenceEntry } from './references.js';
import type { Emit } from './rules/catalogue.js';
const targets:Record<string,readonly string[]>={ownerId:['stakeholders'],approverId:['stakeholders'],assessorId:['stakeholders'],handoffToId:['stakeholders'],beneficiaryIds:['stakeholders'],affectedStakeholderIds:['stakeholders'],workflowIds:['workflows'],needIds:['needs'],requirementIds:['requirements'],kpiIds:['kpis'],testIds:['acceptanceTests'],assumptionIds:['assumptions'],sourceEvidenceIds:['evidence'],evidenceIds:['evidence'],evidenceRequirementIds:['evidence'],subjectIds:['requirements','kpis','workflows']};
const authorCollections=new Set(['stakeholders','needs','problems','workflows','challenges','risks','assumptions','kpis','requirements','acceptanceTests','evidence','decisions','challengeAnswers']);
export function checkReferences(d:Deployment,index:Map<string,ReferenceEntry>,emit:Emit):void {
 function check(id:string,key:string,path:string,owner:string):void {
  const entry=index.get(id), allowed=targets[key];
  const top=entry&&entry.path.split('/').length===3&&authorCollections.has(entry.collection);
  const valid=top&&(!allowed||allowed.includes(entry.collection))&&(key!=='subjectIds'||entry.collection!=='workflows'||entry.record.mode==='intended')&&(key!=='evidenceRequirementIds'||entry.record.purpose==='acceptance-requirement');
  if(!valid)emit('RP-003',[owner,id],[path],`Expected ${allowed?.join(' or ')??'an authoring record'}`);
 }
 function visit(value:unknown,path:string,owner:string):void {
  if(Array.isArray(value)){value.forEach((v,i)=>visit(v,`${path}/${i}`,owner));return;}
  if(!value||typeof value!=='object')return;
  const obj=value as Record<string,unknown>;if(typeof obj.id==='string')owner=obj.id;
  for(const [key,v] of Object.entries(obj)) {
   if(key==='extensions')continue;
   if(targets[key]||key==='relatedIds') {
    if(Array.isArray(v))v.forEach((id,i)=>check(id as string,key,`${path}/${key}/${i}`,owner));
    else if(v&&typeof v==='object'&&'value' in v)check((v as {value:string}).value,key,`${path}/${key}/value`,owner);
    else if(typeof v==='string')check(v,key,`${path}/${key}`,owner);
   }
   visit(v,`${path}/${key}`,owner);
  }
 }
 visit(d.project,'/project',d.project.id);
 for(const collection of authorCollections)visit(d[collection as keyof Deployment],`/${collection}`,d.project.id);
 // Historical reviewer and evidence identifiers describe their old snapshot. Review links are local bookkeeping.
 for(const [collection,rows] of [['approvals',d.review.approvals],['revocations',d.review.revocations],['invalidations',d.review.invalidations]] as const) rows.forEach((row,i)=>{
  if('approvalId' in row&&!d.review.approvals.some(a=>a.id===row.approvalId))emit('RP-003',[row.id,row.approvalId],[`/review/${collection}/${i}/approvalId`]);
  if('acknowledgmentIds' in row) for(const [key,ids,available] of [['acknowledgmentIds',row.acknowledgmentIds,d.review.acknowledgments],['waiverIds',row.waiverIds,d.review.waivers]] as const)ids.forEach(id=>{if(!available.some(a=>a.id===id))emit('RP-003',[row.id,id],[`/review/${collection}/${i}/${key}`]);});
 });
 if(d.review.currentApprovalId&&!d.review.approvals.some(a=>a.id===d.review.currentApprovalId))emit('RP-003',[d.review.currentApprovalId],['/review/currentApprovalId']);
}
