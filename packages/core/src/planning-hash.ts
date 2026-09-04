import type { Deployment, Json } from '@robopomelo/spec';
import { canonicalJson } from './canonical.js';
import { sha256 } from './hash.js';
const collections = new Set([
  'stakeholders',
  'needs',
  'problems',
  'workflows',
  'challenges',
  'risks',
  'assumptions',
  'kpis',
  'requirements',
  'acceptanceTests',
  'evidence',
  'decisions',
  'challengeAnswers',
]);
function orderIds(records: Json[]): Json[] {
  return [...records].sort((a, b) => {
    const x = (a as { id: string }).id,
      y = (b as { id: string }).id;
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
function normalizeRecord(value: Json, key = ''): Json {
  if (key === 'extensions') return value;
  if (Array.isArray(value)) {
    const values = value.map((item) => normalizeRecord(item));
    return key === 'verification' || key === 'exceptions' ? orderIds(values) : values;
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeRecord(v, k)]));
  return value;
}
function planningEvidence(d: Deployment): Set<string> {
  const selected = new Set(d.evidence.filter((e) => e.purpose !== 'decision').map((e) => e.id));
  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (key === 'extensions') continue;
      if ((key === 'sourceEvidenceIds' || key === 'evidenceIds') && Array.isArray(item))
        for (const id of item) if (typeof id === 'string') selected.add(id);
      collect(item);
    }
  }
  for (const [key, value] of Object.entries(d))
    if (!['meta', 'review', 'extensions', 'evidence', 'decisions'].includes(key)) collect(value);
  collect(d.decisions.filter((item) => item.state === 'accepted'));
  const byId = new Map(d.evidence.map((e) => [e.id, e]));
  // Set iteration visits new additions too, so support chains are included once.
  for (const id of selected) {
    const evidence = byId.get(id);
    if (evidence) collect(evidence);
  }
  return selected;
}
/** Versioned planning projection. Source bytes and review bookkeeping have distinct hashes. */
export function planningHash(deployment: Deployment): string {
  const projected: Record<string, Json> = { projectionVersion: '1.0.0' };
  const includedEvidence = planningEvidence(deployment);
  for (const [key, raw] of Object.entries(deployment)) {
    if (key === 'meta' || key === 'review') continue;
    let value = raw as Json;
    if (key === 'evidence')
      value = deployment.evidence.filter((item) => includedEvidence.has(item.id)) as unknown as Json;
    if (key === 'decisions')
      value = deployment.decisions.filter((item) => item.state === 'accepted') as unknown as Json;
    projected[key] = collections.has(key)
      ? orderIds((value as Json[]).map((item) => normalizeRecord(item)))
      : normalizeRecord(value, key);
  }
  return sha256(canonicalJson(projected));
}
