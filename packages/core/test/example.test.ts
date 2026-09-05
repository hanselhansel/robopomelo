import { it, expect } from 'vitest';
import { checkSchema } from '@robopomelo/spec';
import { createInboundExample } from '../src/example.js';
import { validateDeployment } from '../src/validation.js';
it('provides a fictional reviewable example without invented baseline or approval', () => {
  const d = createInboundExample({
    id: 'example-project',
    revision: 'example-revision',
    timestamp: '2026-09-05T00:00:00Z',
  });
  expect(checkSchema(d)).toEqual([]);
  expect(d.extensions['robopomelo.example']).toEqual({ fictional: true });
  expect(d.kpis[0]!.baseline?.state).toBe('unknown');
  expect(d.review.approvals).toEqual([]);
  const report = validateDeployment(d, {
    sourceRevision: d.meta.revisionId,
    sourceHash: 'a'.repeat(64),
    toolVersion: '1.0.0-rc.1',
    evidence: [],
  });
  expect(report.findings.filter((f) => f.severity === 'blocker')).toEqual([]);
  expect(report.readiness).toBe('warnings');
});
