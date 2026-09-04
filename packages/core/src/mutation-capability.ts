import { capabilities, type Capability, type PatchEnvelope, type PatchOperation } from '@robopomelo/spec';
import { DomainError } from './errors.js';
function versionParts(value:string):number[]|null {
 if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))return null;
 const parts=value.split('.').map(Number);return parts.every(Number.isSafeInteger)?parts:null;
}
/** The bundled registry uses stable exact or caret ranges. Other forms fail closed. */
function supportedRange(version:string,range:string):boolean {
 const current=versionParts(version),base=versionParts(range.startsWith('^')?range.slice(1):range);
 if(!current||!base)return false;
 if(!range.startsWith('^'))return current.every((n,i)=>n===base[i]);
 const [major,minor,patch]=base as [number,number,number];
 const [a,b,c]=current as [number,number,number];
 if(a<major||(a===major&&(b<minor||(b===minor&&c<patch))))return false;
 return major>0?a===major:minor>0?a===0&&b===minor:a===0&&b===0&&c===patch;
}
export function assertCapabilitySupport(capability:Capability|undefined,specVersion:string):asserts capability is Capability {
 if(!capability||capability.kind!=='skill'||capability.stage!=='stable'||!capability.available||!supportedRange(specVersion,capability.specRange))throw new DomainError('UNSUPPORTED_CAPABILITY','Declared Skill capability is unavailable or does not support this specification.');
}
export function checkCapabilityOperation(op:PatchOperation,writes:readonly string[]):void {
 const collection=op.op==='project'?'project':op.collection;
 const required=op.op==='add'||op.op==='remove'?[`${collection}.*`]:Object.keys(op.fields).map(field=>`${collection}.${field}`);
 for(const field of required)if(!writes.includes(field)&&!writes.includes(`${collection}.*`))throw new DomainError('FIELD_NOT_ALLOWED',`Declared Skill cannot write ${field}.`,{field});
}
export function checkDeclaredCapability(patch:PatchEnvelope,specVersion:string):void {
 if(patch.capabilityId===undefined)return;
 const capability=capabilities.find(c=>c.id===patch.capabilityId);assertCapabilitySupport(capability,specVersion);
 for(const op of patch.operations)checkCapabilityOperation(op,capability.fieldsWritten);
}
