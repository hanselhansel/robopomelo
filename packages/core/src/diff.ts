import type { Deployment, FieldDiff, Json } from '@robopomelo/spec';
import { same } from './permissions.js';
const collections=['stakeholders','needs','problems','workflows','challenges','risks','assumptions','kpis','requirements','acceptanceTests','evidence','decisions','challengeAnswers'] as const;
export function semanticDiff(before:Deployment,after:Deployment):FieldDiff[] {
 const diff:FieldDiff[]=[];
 const fields=(collection:string,id:string,a:Record<string,unknown>,b:Record<string,unknown>)=>{
  for(const field of [...new Set([...Object.keys(a),...Object.keys(b)])].sort())if(field!=='id'&&!same(a[field],b[field]))diff.push({collection,id,field,before:(a[field]??null) as Json,after:(b[field]??null) as Json});
 };
 fields('project',before.project.id,{...before.project},{...after.project});
 for(const collection of collections) {
  const old=new Map(before[collection].map(r=>[r.id,r]));const next=new Map(after[collection].map(r=>[r.id,r]));
  for(const id of [...new Set([...old.keys(),...next.keys()])].sort()) {
   const a=old.get(id),b=next.get(id);
   if(!a||!b)diff.push({collection,id,field:'$record',before:(a??null) as unknown as Json,after:(b??null) as unknown as Json});
   else fields(collection,id,{...a},{...b});
  }
 }
 fields('review',before.project.id,{...before.review},{...after.review});
 return diff;
}
