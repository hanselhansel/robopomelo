import type { Deployment, TraceabilityRow } from '@robopomelo/spec';
import { hasValue } from './knowledge.js';
const unique = (values: Iterable<string>): string[] => [...new Set(values)].sort();
const intersects = (values: string[], selected: Set<string>): boolean =>
  values.some((id) => selected.has(id));
export function traceability(d: Deployment): TraceabilityRow[] {
  return d.needs.map((need) => {
    const workflowIds = unique([
      ...need.workflowIds,
      ...d.workflows.filter((flow) => flow.needIds.includes(need.id)).map((flow) => flow.id),
    ]);
    const flowSet = new Set(workflowIds);
    const requirementIds = unique([
      ...need.requirementIds,
      ...d.requirements.filter((req) => req.needIds.includes(need.id)).map((req) => req.id),
    ]);
    const requirements = d.requirements.filter((req) => requirementIds.includes(req.id));
    const kpiIds = unique([
      ...d.kpis
        .filter((kpi) => kpi.needIds.includes(need.id) || intersects(kpi.workflowIds, flowSet))
        .map((kpi) => kpi.id),
      ...requirements.flatMap((req) => req.kpiIds),
    ]);
    const subjects = new Set([...workflowIds, ...requirementIds, ...kpiIds]);
    const testIds = unique([
      ...requirements.flatMap((req) => req.testIds),
      ...d.acceptanceTests.filter((test) => intersects(test.subjectIds, subjects)).map((test) => test.id),
    ]);
    const related = new Set([need.id, ...subjects, ...testIds]);
    const records = [
      need,
      ...d.workflows.filter((flow) => flowSet.has(flow.id)),
      ...requirements,
      ...d.kpis.filter((kpi) => kpiIds.includes(kpi.id)),
      ...d.acceptanceTests.filter((test) => testIds.includes(test.id)),
    ];
    const evidenceIds = unique([
      ...records.flatMap((record) => record.sourceEvidenceIds),
      ...d.acceptanceTests
        .filter((test) => testIds.includes(test.id))
        .flatMap((test) => test.evidenceRequirementIds),
      ...d.evidence
        .filter((evidence) => intersects(evidence.relatedIds, related))
        .map((evidence) => evidence.id),
    ]);
    const gapRuleIds =
      workflowIds.length === 0 && requirementIds.length === 0 && !hasValue(need.disposition)
        ? ['RP-012']
        : [];
    return { needId: need.id, workflowIds, kpiIds, requirementIds, testIds, evidenceIds, gapRuleIds };
  });
}
