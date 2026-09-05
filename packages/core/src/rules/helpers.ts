import type { Deployment, Evidence, Knowledge, ValidationContext } from '@robopomelo/spec';
import { hasValue } from '../knowledge.js';
export const textValue = (k: Knowledge<string> | undefined): boolean =>
  hasValue(k) && k.value.trim().length > 0;
export const disposition = (k: Knowledge<string>): boolean =>
  textValue(k) || (k?.state === 'not-applicable' && k.reason.trim().length > 0);
export const person = (d: Deployment, k: Knowledge<string>): boolean =>
  hasValue(k) && d.stakeholders.some((p) => p.id === k.value);
export const records = (d: Deployment) =>
  Object.entries(d).filter((entry): entry is [keyof Deployment, Deployment['needs']] =>
    Array.isArray(entry[1]),
  );
export function available(e: Evidence, c: ValidationContext): boolean {
  if (e.location.kind !== 'attachment') return false;
  const observations = c.evidence.filter((o) => o.evidenceId === e.id);
  return (
    observations.length === 1 &&
    observations[0]!.state === 'present' &&
    observations[0]!.sha256 === e.location.sha256 &&
    (observations[0]!.size === undefined || observations[0]!.size === e.location.size)
  );
}
