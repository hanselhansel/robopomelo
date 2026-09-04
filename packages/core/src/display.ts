import type { Knowledge } from '@robopomelo/spec';
import { knowledgeText } from './knowledge.js';
export const words=(value:string):string => value.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,letter=>letter.toUpperCase());
/** Plain display text only. Every renderer must escape for its own output syntax. */
export function displayValue(value:unknown,names:ReadonlyMap<string,string>=new Map()):string {
  if(value===null||value===undefined)return 'Missing';
  if(typeof value==='string')return names.get(value)??value;
  if(typeof value==='boolean')return value?'Yes':'No';
  if(typeof value==='number')return String(value);
  if(Array.isArray(value))return value.length?value.map(item=>displayValue(item,names)).join('; '):'None recorded';
  if(typeof value!=='object')return 'Unsupported value';
  const record=value as Record<string,unknown>;
  if(['provided','unverified','unknown','not-applicable'].includes(String(record.state)))return knowledgeText(value as Knowledge<unknown>,item=>displayValue(item,names));
  if(typeof record.value==='string'&&typeof record.unit==='string'&&typeof record.subject==='string')return `${record.value} ${record.unit} (${record.subject})`;
  if(record.kind==='future')return `Future evidence: ${record.description}`;
  if(record.kind==='external')return `External reference (not fetched): ${record.uri}`;
  if(record.kind==='attachment')return `Attachment: ${record.path}; SHA-256: ${record.sha256}; ${record.size} bytes`;
  return Object.entries(record).filter(([key])=>key!=='id'&&key!=='extensions').map(([key,item])=>`${words(key)}: ${displayValue(item,names)}`).join('; ');
}
