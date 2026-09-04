import type { Deployment } from '@robopomelo/spec';
import { hasValue } from '../knowledge.js';
import { compareQuantities } from '../quantities.js';
import { interpretable } from './metrics.js';
import { person, textValue } from './helpers.js';
import type { Emit } from './catalogue.js';
export function acceptance(d: Deployment, emit: Emit): void {
  if (!d.acceptanceTests.length) emit('RP-050', [d.project.id], ['/acceptanceTests']);
  d.acceptanceTests.forEach((t, i) => {
    const path = `/acceptanceTests/${i}`;
    let valid = hasValue(t.criterion);
    if (hasValue(t.criterion)) {
      const c = t.criterion.value;
      if (c.kind === 'categorical')
        valid = c.expected.length > 0 && c.expected.every((s) => s.trim().length > 0);
      if (c.kind === 'numeric') {
        valid = interpretable(c.threshold);
        if (c.operator === 'between') {
          if (!c.upper) valid = false;
          else
            try {
              valid = valid && compareQuantities(c.threshold, c.upper) <= 0;
            } catch {
              valid = false;
              emit('RP-032', [t.id], [`${path}/criterion`]);
            }
        }
        if (!interpretable(c.threshold)) emit('RP-032', [t.id], [`${path}/criterion`]);
      }
    }
    if (!valid || !t.procedure.some((s) => s.trim()) || !textValue(t.measurementMethod))
      emit('RP-050', [t.id], [path]);
    const subject = t.subjectIds.some(
      (id) =>
        d.requirements.some((r) => r.id === id) ||
        d.kpis.some((k) => k.id === id) ||
        d.workflows.some((w) => w.id === id && w.mode === 'intended'),
    );
    const evidence = t.evidenceRequirementIds.some((id) =>
      d.evidence.some((e) => e.id === id && e.purpose === 'acceptance-requirement'),
    );
    if (!subject || !evidence || !person(d, t.approverId)) emit('RP-051', [t.id], [path]);
    if (!person(d, t.assessorId)) emit('RP-011', [t.id], [`${path}/assessorId`]);
  });
}
