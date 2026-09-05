// Regression: ISSUE-004, a selected changed attachment produced a generic 500/receipt message.
// Found by /qa on 2026-09-05. Report: .gstack/qa-reports/qa-report-robopomelo-2026-09-05.md
import { it, expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '@robopomelo/core';
import { evidenceRoutes } from '../../apps/cli/src/server/evidence-routes.js';
import { exportRoutes } from '../../apps/cli/src/server/export-routes.js';
import { appFixture } from './helpers/app.js';
it('returns a typed evidence-specific recovery error without offering an export preview', async () => {
  const app = await appFixture((service) => [...evidenceRoutes(service), ...exportRoutes(service)]);
  try {
    const initial = await app.service.snapshot();
    const bytes = 'Fictional original evidence';
    const prepared = await app.call('/api/evidence/prepare', {
      expected: { sourceRevision: initial.sourceRevision, sourceHash: initial.sourceHash },
      mutationId: 'integrity-check',
      title: 'Fictional receiving notes',
      purpose: 'planning',
      provenance: null,
      relatedIds: [],
      file: { name: 'receiving.txt', size: bytes.length, sha256: sha256(bytes) },
    });
    await app.raw(`/api/evidence/uploads/${prepared.body.data.uploadId}`, bytes, 'PUT');
    const saved = await app.service.snapshot();
    const evidence = saved.deployment.evidence[0]!;
    if (evidence.location.kind !== 'attachment') throw new Error('Expected attachment fixture');
    await writeFile(join(app.temp, 'project', evidence.location.path), 'Changed test bytes');
    const response = await app.call('/api/export/preview', {
      expected: { sourceRevision: saved.sourceRevision, sourceHash: saved.sourceHash },
      selectedEvidenceIds: [evidence.id],
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EXPORT_EVIDENCE_CHANGED');
    expect(response.body.error.message).toContain('Fictional receiving notes');
    expect(response.body.error.message).toMatch(/recheck|Check evidence/i);
    expect(response.body.error.message).not.toContain('receipt');
    expect(response.body).not.toHaveProperty('data.previewId');
  } finally {
    await app.close();
  }
});
