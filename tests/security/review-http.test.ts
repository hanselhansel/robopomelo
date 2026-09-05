import { it, expect } from 'vitest';
import { reviewRoutes } from '../../apps/cli/src/server/review-routes.js';
import { appFixture } from './helpers/app.js';
it('exposes actual history comparisons and immutable proposal application', async () => {
  const app = await appFixture(reviewRoutes);
  try {
    const snapshot = await app.service.snapshot();
    await app.call('/api/trust', {
      action: 'grant',
      scopes: ['author'],
      mode: 'review-each-change',
      remember: false,
    });
    const patch = {
      formatVersion: '1.0.0',
      id: 'proposal-one',
      projectId: snapshot.deployment.project.id,
      baseRevision: snapshot.sourceRevision,
      baseHash: snapshot.sourceHash,
      actor: { kind: 'human', name: 'Author' },
      purpose: 'Frame a problem',
      operations: [{ op: 'project', fields: { problem: { state: 'provided', value: 'No handoff owner' } } }],
    };
    const proposed = await app.call('/api/patch/apply', { patch });
    expect(proposed.body.data.kind).toBe('proposal');
    const list = await app.call('/api/proposals');
    expect(list.body.data[0].mutation.kind).toBe('patch');
    const applied = await app.call('/api/proposals/proposal-one/apply', {
      expected: { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash },
      approvedPatchDigest: proposed.body.data.patchDigest,
    });
    expect(applied.body.data.kind).toBe('committed');
    const preview = await app.call(`/api/history/${snapshot.sourceRevision}/restore-preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.diff.some((d: { field: string }) => d.field === 'problem')).toBe(true);
  } finally {
    await app.close();
  }
});
