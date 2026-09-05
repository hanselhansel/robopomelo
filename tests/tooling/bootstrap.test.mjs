import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { assertBootstrap } from '../../scripts/bootstrap-policy.mjs';
const now = Date.now(),
  commit = 'a'.repeat(40),
  sha256 = 'b'.repeat(64);
const input = () => ({
  version: '1.0.0-rc.1',
  target: '1.0.0',
  commit,
  head: commit,
  sha256,
  now,
  environment: {
    GITHUB_ACTIONS: 'true',
    GITHUB_SHA: commit,
    GITHUB_REPOSITORY: 'hanselhansel/robopomelo',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'hanselhansel/robopomelo/.github/workflows/release.yml@refs/heads/main',
    RUNNER_ENVIRONMENT: 'github-hosted',
  },
  verification: {
    version: '1.0.0-rc.1',
    verifiedAt: new Date(now - 1000).toISOString(),
    tarballSha256: sha256,
    checks: ['packaged HTTP launch'],
  },
});
test('accepts only exact verified candidate bytes from the authorized main workflow', () =>
  assert.doesNotThrow(() => assertBootstrap(input())));
test('rejects forks, branches, different commits, stale verification and stable bootstrap', () => {
  for (const change of [
    { version: '1.0.0' },
    { head: 'c'.repeat(40) },
    { sha256: 'd'.repeat(64) },
    { now: now + 3600001 },
    { environment: { ...input().environment, GITHUB_REF: 'refs/heads/feat/v1' } },
    { environment: { ...input().environment, GITHUB_REPOSITORY: 'other/robopomelo' } },
  ])
    assert.throws(() => assertBootstrap({ ...input(), ...change }));
});
test('pinned npm publisher provides its official provenance generator', () => {
  const require = createRequire(import.meta.url);
  assert.equal(require('libnpmpublish/package.json').version, '12.0.0');
  assert.equal(typeof require('libnpmpublish/lib/provenance.js').generateProvenance, 'function');
});
