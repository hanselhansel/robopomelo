import { capabilities, knownExtensionNamespaces, VERIFICATION_CLAIM_PATHS, type Collection, type Deployment, type ValidationContext } from '@robopomelo/spec';
import { available, records } from './helpers.js';
import type { Emit } from './catalogue.js';
export function evidence(d:Deployment,c:ValidationContext,emit:Emit):void {
 d.evidence.forEach((e,i)=>{
  if(e.purpose!=='planning')return;
  if(e.location.kind==='attachment'&&e.required&&!available(e,c))emit('RP-060',[e.id],[`/evidence/${i}/location`]);
  if(e.location.kind!=='attachment'||!available(e,c))emit('RP-061',[e.id],[`/evidence/${i}/location`]);
 });
 for(const [collection,rows] of records(d))rows.forEach((r,i)=>r.verification?.forEach((v,j)=>{
  const permitted=VERIFICATION_CLAIM_PATHS[collection as Collection] as readonly string[];
  if(!permitted.includes(v.claimPath))emit('RP-001',[r.id,v.id],[`/${collection}/${i}/verification/${j}/claimPath`]);
  if(v.required&&(!v.evidenceIds.length||!v.evidenceIds.every(id=>d.evidence.some(e=>e.id===id&&e.purpose==='planning'&&available(e,c)))))emit('RP-062',[r.id,v.id],[`/${collection}/${i}/verification/${j}`]);
 }));
 const scanExtensions=(extensions:Deployment['extensions'],path:string,id:string)=>{
  for(const [key,value] of Object.entries(extensions)) {
   if(!knownExtensionNamespaces.includes(key))emit('RP-090',[id],[`${path}/${key}`]);
   if(key==='robopomelo.capabilities') {
    if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.required)||Object.keys(value).some(k=>k!=='required')||value.required.some(v=>typeof v!=='string'))emit('RP-001',[id],[`${path}/${key}`],'Expected an object with a required string array');
    else for(const required of value.required)if(!capabilities.some(cap=>cap.id===required&&cap.available&&cap.stage!=='removed'))emit('RP-004',[id],[`${path}/${key}`],String(required));
   }
  }
 };
 scanExtensions(d.extensions,'/extensions',d.project.id);
 for(const [collection,rows] of records(d))rows.forEach((r,i)=>scanExtensions(r.extensions,`/${collection}/${i}/extensions`,r.id));
}
