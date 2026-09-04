import {
  checkSchema,
  type Deployment,
  type Finding,
  type ValidationContext,
  type ValidationReport,
} from '@robopomelo/spec';
import { buildReferenceIndex } from './references.js';
import { checkReferences } from './reference-checks.js';
import { approvalDetails } from './review-validity.js';
import { finding, RULE_SET_VERSION, type Emit } from './rules/catalogue.js';
import { framing } from './rules/framing.js';
import { flows } from './rules/flows.js';
import { metrics } from './rules/metrics.js';
import { acceptance } from './rules/acceptance.js';
import { evidence } from './rules/evidence.js';
import { issues } from './rules/issues.js';
import { applyWarningDecisions, reviewRecords } from './rules/review-records.js';
const labels = {
  blocked: 'Specification blocked',
  warnings: 'Specification ready with warnings',
  ready: 'Specification ready for review',
};
export function validateDeployment(input: unknown, context: ValidationContext): ValidationReport {
  const findings: Finding[] = [];
  const emit: Emit = (id, records, paths, detail) => {
    const f = finding(id, records, paths, detail);
    if (!findings.some((old) => old.fingerprint === f.fingerprint)) findings.push(f);
  };
  const version =
    input && typeof input === 'object' && 'specVersion' in input && typeof input.specVersion === 'string'
      ? input.specVersion
      : null;
  const report = (): ValidationReport => {
    const active = findings.filter((f) => f.status === 'active');
    const counts = {
      blockers: active.filter((f) => f.severity === 'blocker').length,
      warnings: active.filter((f) => f.severity === 'warning').length,
      waived: findings.filter((f) => f.status === 'waived').length,
      unacknowledged: active.filter((f) => f.severity === 'warning' && !f.acknowledged).length,
    };
    const readiness = counts.blockers ? 'blocked' : counts.warnings ? 'warnings' : 'ready';
    return {
      readiness,
      label: labels[readiness],
      findings,
      counts,
      sourceRevision: context.sourceRevision,
      sourceHash: context.sourceHash,
      toolVersion: context.toolVersion,
      specVersion: version,
      ruleSetVersion: RULE_SET_VERSION,
    };
  };
  if (version !== null && version !== '1.0.0') {
    emit('RP-004', [], ['/specVersion']);
    return report();
  }
  const errors = checkSchema(input);
  if (errors.length) {
    for (const error of errors) {
      emit('RP-001', [], [error.instancePath || '/'], error.message);
      if (error.instancePath.endsWith('/id') && error.keyword === 'pattern')
        emit('RP-002', [], [error.instancePath]);
      if (error.instancePath.startsWith('/review/')) emit('RP-081', [], [error.instancePath]);
    }
    return report();
  }
  const d = input as Deployment;
  let index;
  try {
    index = buildReferenceIndex(d);
  } catch (error) {
    emit('RP-002', [], ['/'], error instanceof Error ? error.message : 'Duplicate ID');
    return report();
  }
  checkReferences(d, index, emit);
  framing(d, emit);
  flows(d, emit);
  metrics(d, emit);
  acceptance(d, emit);
  evidence(d, context, emit);
  issues(d, emit);
  reviewRecords(d, emit);
  applyWarningDecisions(d, findings);
  const details = approvalDetails(d, report());
  if (details.status === 'stale')
    emit(
      'RP-080',
      details.decisionId ? [details.decisionId] : [],
      ['/review/currentApprovalId'],
      details.reasons.map((r) => r.code).join(', '),
    );
  applyWarningDecisions(d, findings);
  return report();
}
