import type { Deployment, Json } from '@robopomelo/spec';
import { canonicalJson } from './canonical.js';
import { sha256 } from './hash.js';
const collections = new Set(['stakeholders','needs','problems','workflows','challenges','risks','assumptions','kpis','requirements','acceptanceTests','evidence','decisions','challengeAnswers']);
function orderIds(records: Json[]): Json[] {
  return [...records].sort((a,b) => {
    const x=(a as {id:string}).id, y=(b as {id:string}).id;
    return x<y ? -1 : x>y ? 1 : 0;
  });
}
function normalizeRecord(value: Json, key = ''): Json {
  if (key === 'extensions') return value;
  if (Array.isArray(value)) {
    const values=value.map(item=>normalizeRecord(item));
    return key === 'verification' || key === 'exceptions' ? orderIds(values) : values;
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalizeRecord(v,k)]));
  return value;
}
/** Versioned planning projection. Source bytes and review bookkeeping have distinct hashes. */
export function planningHash(deployment: Deployment): string {
  const projected: Record<string,Json> = {projectionVersion:'1.0.0'};
  for (const [key,raw] of Object.entries(deployment)) {
    if (key === 'meta' || key === 'review') continue;
    let value = raw as Json;
    if (key === 'evidence') value = deployment.evidence.filter(item => item.purpose !== 'decision') as unknown as Json;
    if (key === 'decisions') value = deployment.decisions.filter(item => item.state === 'accepted') as unknown as Json;
    projected[key] = collections.has(key) ? orderIds((value as Json[]).map(item=>normalizeRecord(item))) : normalizeRecord(value,key);
  }
  return sha256(canonicalJson(projected));
}
