import type { Actor, Collection, Json, PatchContext, RecordBase, Scope } from '@robopomelo/spec';
import { canonicalJson } from './canonical.js';
import { DomainError } from './errors.js';
export const same=(a:unknown,b:unknown):boolean=>canonicalJson((a??null) as Json)===canonicalJson((b??null) as Json);
export function requireScope(context:PatchContext,scope:Scope):void {if(!context.scopes.includes(scope))throw new DomainError('SCOPE_REQUIRED',`Required scope: ${scope}`,{scope});}
export function assertActor(actor:Actor):void {
 if(!actor.name.trim()||!['human','agent','external'].includes(actor.kind))throw new DomainError('INVALID_ACTOR','Supply an attributed actor.');
}
/** An agent can record a supplied human decision only with matching delegation provenance. */
export function assertDecisionRecorder(recorder:Actor,personName:string,source:string):void {
 assertActor(recorder);
 if(!personName.trim()||!source.trim())throw new DomainError('INVALID_PROVENANCE','Supply the decision person and source.');
 if(recorder.kind==='agent'&&(!recorder.onBehalfOf?.trim()||recorder.onBehalfOf!==personName||recorder.source!==source))throw new DomainError('INVALID_PROVENANCE','Agent decision recording requires matching human delegation and source.');
 if(recorder.kind!=='agent'&&recorder.name!==personName&&recorder.onBehalfOf!==personName)throw new DomainError('INVALID_PROVENANCE','Recorder must identify the decision person or supplied delegation.');
}
function requireDecision(context:PatchContext,actor:Actor):void {
 requireScope(context,'record-decisions');
 if(actor.kind==='agent'&&(!actor.onBehalfOf?.trim()||!actor.source?.trim()))throw new DomainError('INVALID_PROVENANCE','Agent protected changes require explicit human delegation and source.');
}
export function safeAttachmentPath(path:string):boolean {
 const parts=path.split('/');
 return parts.length>=2&&parts[0]==='evidence'&&parts.every(p=>p.length>0&&p!=='.'&&p!=='..')&&!/[\\\u0000-\u001f\u007f:]/.test(path);
}
export function checkRecordPermissions(collection:Collection,before:RecordBase|undefined,after:RecordBase|undefined,context:PatchContext,actor:Actor):void {
 const old=before as (RecordBase&Record<string,unknown>)|undefined;
 const next=after as (RecordBase&Record<string,unknown>)|undefined;
 if(same(before,after))return;
 if((old?.state==='accepted'||next?.state==='accepted')&&collection==='decisions')requireDecision(context,actor);
 if(collection==='decisions'&&next?.state==='accepted') {
  const decisionActor=next.actor as Actor|null;
  if(!decisionActor||decisionActor.kind==='agent'||!decisionActor.source?.trim())throw new DomainError('INVALID_PROVENANCE','Accepted decisions require a supplied human actor and source.');
  assertDecisionRecorder(actor,decisionActor.name,decisionActor.source);
 }
 if((old&&next&&!same(old.requiredBeforeReview,next.requiredBeforeReview))||(!old&&next?.requiredBeforeReview===true)||(old?.requiredBeforeReview===true&&!next))requireDecision(context,actor);
 const previous=new Map((before?.verification??[]).map(v=>[v.id,v]));
 const incoming=new Map((after?.verification??[]).map(v=>[v.id,v]));
 for(const id of new Set([...previous.keys(),...incoming.keys()])) {
  const a=previous.get(id),b=incoming.get(id);
  if(!same(a,b)&&(a?.required||b?.required||a?.attestation||b?.attestation))requireDecision(context,actor);
  if(b?.attestation&&!same(a?.attestation,b.attestation)) {
   if(b.attestation.actor.kind==='agent')throw new DomainError('INVALID_PROVENANCE','A verification attestation requires a supplied human assertion.');
   assertDecisionRecorder(actor,b.attestation.actor.name,b.attestation.source);
  }
 }
 if(collection==='evidence') {
  if(old?.purpose==='decision'||next?.purpose==='decision')requireDecision(context,actor);
  const oldLocation=old?.location as {kind:string;path?:string}|undefined;
  const nextLocation=next?.location as {kind:string;path?:string}|undefined;
  if((oldLocation?.kind==='attachment'||nextLocation?.kind==='attachment')&&(!old||!next||!same(oldLocation,nextLocation)))requireScope(context,'evidence');
  if(nextLocation?.kind==='attachment'&&(!nextLocation.path||!safeAttachmentPath(nextLocation.path)))throw new DomainError('UNSAFE_EVIDENCE_PATH','Attachment path must be allocated under evidence/ without traversal.');
 }
}
