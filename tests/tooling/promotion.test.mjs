import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPromotion } from '../../scripts/promotion-policy.mjs';
const now = Date.now(),
  commit = 'a'.repeat(40);
const input = () => ({
  version: '1.0.0',
  commit,
  now,
  proof: {
    formatVersion: 1,
    status: 'passed',
    version: '1.0.0',
    sourceCommit: commit,
    verifiedAt: new Date(now - 1000).toISOString(),
    checks: ['packaged HTTP launch'],
    integrity: 'sha512-exact',
  },
  metadata: { version: '1.0.0', dist: { integrity: 'sha512-exact' } },
  latest: '0.9.0',
});
test('promotes only the exact recently verified stable artifact', () =>
  assert.doesNotThrow(() => assertPromotion(input())));
test('rejects changed source, stale proof, replaced payload and rollback', () => {
  for (const change of [
    { commit: 'b'.repeat(40) },
    { version: '1.0.0-rc.1' },
    { latest: '2.0.0' },
    { now: now + 3600001 },
    { metadata: { version: '1.0.0', dist: { integrity: 'different' } } },
    { proof: { ...input().proof, checks: [] } },
  ])
    assert.throws(() => assertPromotion({ ...input(), ...change }));
});
