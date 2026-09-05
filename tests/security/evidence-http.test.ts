import { it, expect } from 'vitest';
import { sha256 } from '@robopomelo/core';
import { evidenceRoutes } from '../../apps/cli/src/server/evidence-routes.js';
import { appFixture } from './helpers/app.js';
it('uploads explicitly selected bytes and downloads only the confined attachment', async () => {
  const app = await appFixture(evidenceRoutes);
  try {
    const snapshot = await app.service.snapshot(),
      bytes = 'selected evidence bytes';
    const prepared = await app.call('/api/evidence/prepare', {
      expected: { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash },
      mutationId: 'upload-one',
      title: 'Receiving observation',
      purpose: 'planning',
      provenance: { state: 'provided', value: 'Explicit test fixture' },
      relatedIds: [],
      file: { name: 'observation.txt', size: bytes.length, sha256: sha256(bytes) },
    });
    expect(prepared.status).toBe(200);
    expect(prepared.body.data.digest).toMatch(/^[a-f0-9]{64}$/);
    const uploaded = await app.raw(`/api/evidence/uploads/${prepared.body.data.uploadId}`, bytes, 'PUT');
    expect(uploaded.status).toBe(200);
    const evidence = (await app.service.snapshot()).deployment.evidence[0]!;
    const download = await app.raw(`/api/evidence/${evidence.id}/download`);
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(await download.text()).toBe(bytes);
    expect((await app.call('/api/evidence')).body.data.observations[0].state).toBe('present');
  } finally {
    await app.close();
  }
});
