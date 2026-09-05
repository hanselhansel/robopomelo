import type { Deployment, Quantity } from '@robopomelo/spec';
import { hasValue } from '../knowledge.js';
import { compareQuantities } from '../quantities.js';
import { person, textValue } from './helpers.js';
import type { Emit } from './catalogue.js';
export function interpretable(q: Quantity): boolean {
  try {
    compareQuantities(q, q);
    return true;
  } catch {
    return false;
  }
}
export function metrics(d: Deployment, emit: Emit): void {
  if (!d.kpis.length) emit('RP-030', [d.project.id], ['/kpis']);
  d.kpis.forEach((k, i) => {
    const path = `/kpis/${i}`;
    if (
      !textValue(k.definition) ||
      !hasValue(k.target) ||
      !interpretable(k.target.value) ||
      !textValue(k.measurementMethod) ||
      !textValue(k.measurementWindow)
    )
      emit('RP-030', [k.id], [path]);
    if (!person(d, k.ownerId)) emit('RP-011', [k.id], [`${path}/ownerId`]);
    if (!k.baseline || k.baseline.state === 'unknown' || k.baseline.state === 'unverified')
      emit('RP-031', [k.id], [`${path}/baseline`]);
    if (hasValue(k.target) && hasValue(k.baseline))
      try {
        compareQuantities(k.target.value, k.baseline.value);
      } catch {
        emit('RP-032', [k.id], [`${path}/baseline`, `${path}/target`]);
      }
    else if (hasValue(k.target) && !interpretable(k.target.value)) emit('RP-032', [k.id], [`${path}/target`]);
  });
}
