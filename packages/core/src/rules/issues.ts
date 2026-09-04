import type { Deployment } from '@robopomelo/spec';
import { person, textValue } from './helpers.js';
import type { Emit } from './catalogue.js';
export function issues(d:Deployment,emit:Emit):void {
 for(const collection of ['challenges','risks','assumptions'] as const)d[collection].forEach((r,i)=>{
  const path=`/${collection}/${i}`;
  const resolved=r.status==='resolved'&&textValue(r.resolution);
  if(r.requiredBeforeReview&&!resolved)emit('RP-041',[r.id],[path]);
  if(!resolved) {
   const complete=textValue(r.statement)&&person(d,r.ownerId)&&textValue(r.nextAction);
   if(!complete)emit('RP-070',[r.id],[path]);
   else if(!r.requiredBeforeReview)emit('RP-071',[r.id],[path]);
  }
 });
}
