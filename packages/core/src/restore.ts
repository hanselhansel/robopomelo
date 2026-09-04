import { checkSchema, type Deployment, type PatchContext, type PatchEnvelope, type PatchEvaluation } from '@robopomelo/spec';
import { assertMutationBase, finishMutation } from './mutation-common.js';
import { checkRecordPermissions, requireScope } from './permissions.js';
import { DomainError } from './errors.js';
export type RestoreRequest=Omit<PatchEnvelope,'formatVersion'|'operations'>;
const collections=['stakeholders','needs','problems','workflows','challenges','risks','assumptions','kpis','requirements','acceptanceTests','evidence','decisions','challengeAnswers'] as const;
/** Internal reconciliation of authored content, retaining the current protected review ledger. */
export function evaluateRestore(current:Deployment,target:Deployment,request:RestoreRequest,context:PatchContext):PatchEvaluation {
 assertMutationBase(current,{...request,formatVersion:'1.0.0',operations:[]},context,'patch');requireScope(context,'author');
 const errors=checkSchema(target);
 if(errors.length)throw new DomainError('INVALID_SCHEMA','Restore target violates the supported deployment schema.',errors);
 if(target.project.id!==current.project.id)throw new DomainError('PROJECT_MISMATCH','Restore target belongs to another project.');
 const candidate=structuredClone(target);
 candidate.review=structuredClone(current.review);candidate.meta=structuredClone(current.meta);
 for(const collection of collections) {
  const before=new Map(current[collection].map(r=>[r.id,r]));const after=new Map(candidate[collection].map(r=>[r.id,r]));
  for(const id of new Set([...before.keys(),...after.keys()]))checkRecordPermissions(collection,before.get(id),after.get(id),context,request.actor);
 }
 return finishMutation(current,candidate,context);
}
