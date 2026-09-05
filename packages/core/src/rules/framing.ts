import type { Deployment } from '@robopomelo/spec';
import { hasValue } from '../knowledge.js';
import { disposition, person, textValue } from './helpers.js';
import type { Emit } from './catalogue.js';
export function framing(d: Deployment, emit: Emit): void {
  for (const key of ['problem', 'outcome', 'scope'] as const)
    if (!textValue(d.project[key])) emit('RP-010', [d.project.id], [`/project/${key}`]);
  if (!person(d, d.project.approverId)) emit('RP-011', [d.project.id], ['/project/approverId']);
  else if (hasValue(d.project.approverId)) {
    const p = d.stakeholders.find((s) => s.id === (d.project.approverId as { value: string }).value)!;
    if (!textValue(p.role) || !p.responsibilities.some((r) => r.trim()))
      emit('RP-011', [p.id], ['/stakeholders/' + d.stakeholders.indexOf(p)]);
  }
  if (
    !d.needs.some(
      (n) => textValue(n.outcome) && n.beneficiaryIds.some((id) => d.stakeholders.some((s) => s.id === id)),
    )
  )
    emit('RP-013', [d.project.id], ['/needs']);
  d.needs.forEach((n, i) => {
    if (!n.workflowIds.length && !n.requirementIds.length && !disposition(n.disposition))
      emit('RP-012', [n.id], [`/needs/${i}`]);
  });
  if (!d.requirements.some((r) => textValue(r.capability))) emit('RP-042', [d.project.id], ['/requirements']);
  d.requirements.forEach((r, i) => {
    if (
      !textValue(r.rationale) ||
      (!r.needIds.length && !r.workflowIds.length && !r.kpiIds.length) ||
      (!r.testIds.length && !disposition(r.verificationDisposition))
    )
      emit('RP-040', [r.id], [`/requirements/${i}`]);
  });
}
