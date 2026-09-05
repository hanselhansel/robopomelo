import { it, expect } from 'vitest';
import { exportRoutes } from '../../apps/cli/src/server/export-routes.js';
import { appFixture } from './helpers/app.js';
it('previews and downloads a real review ZIP from an immutable source selection', async () => {
  const app = await appFixture(exportRoutes);
  try {
    const snapshot = await app.service.snapshot();
    const expected = { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash };
    const preview = await app.call('/api/export/preview', { expected, selectedEvidenceIds: [] });
    expect(preview.status).toBe(200);
    expect(preview.body.data.members.some((m: { path: string }) => m.path === 'deployment.yaml')).toBe(true);
    const response = await fetch(app.host.url + '/api/export');
    expect(response.status).toBe(403);
    // Authenticated raw JSON request uses the fixture's session-bound helper.
    const downloaded = await app.raw(
      '/api/export',
      JSON.stringify({ previewId: preview.body.data.previewId, expected }),
      'POST',
      'application/json',
    );
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get('content-type')).toContain('application/zip');
    const bytes = new Uint8Array(await downloaded.arrayBuffer());
    expect([...bytes.slice(0, 2)]).toEqual([80, 75]);
  } finally {
    await app.close();
  }
});
