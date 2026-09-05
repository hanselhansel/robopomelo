import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSuccessfulJobs } from '../../scripts/check-plan-coverage.mjs';
import { verifyVersions, assertReleaseContext } from '../../scripts/verify-versions.mjs';

for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
  test(`aggregate rejects ${result ?? 'missing'} required evidence`, () => {
    const jobs = { source: { result: 'success' }, browser: { result: 'success' } };
    if (result) jobs.native = { result };
    assert.throws(() => assertSuccessfulJobs(jobs, ['source', 'native', 'browser']), /native/);
  });
}
test('aggregate accepts only complete successful evidence', () => {
  assert.doesNotThrow(() =>
    assertSuccessfulJobs({ a: { result: 'success' }, b: { result: 'success' } }, ['a', 'b']),
  );
  assert.throws(() => assertSuccessfulJobs({}, []), /expected/);
});
test('source version guard catches root and lock drift without rewriting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'version-guard-'));
  try {
    await writeFile(join(root, 'VERSION'), '1.0.0\n');
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: '@robopomelo/workspace', private: true, version: '1.0.0' }),
    );
    await writeFile(
      join(root, 'package-lock.json'),
      JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } } }),
    );
    assert.equal(await verifyVersions(root), '1.0.0');
    await writeFile(join(root, 'VERSION'), '1.0.0-rc.1\n');
    await assert.rejects(verifyVersions(root), /three-part/);
    await writeFile(join(root, 'VERSION'), '1.1.0\n');
    await assert.rejects(verifyVersions(root), /synchronized/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
const sha = 'a'.repeat(40);
const context = {
  target: '1.0.0',
  version: '1.0.0-rc.1',
  channel: 'candidate',
  mode: 'bootstrap',
  head: sha,
  expectedCommit: sha,
  remoteMain: sha,
  dirty: false,
  environment: {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: 'hanselhansel/robopomelo',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    GITHUB_WORKFLOW_REF: 'hanselhansel/robopomelo/.github/workflows/release.yml@refs/heads/main',
    RUNNER_ENVIRONMENT: 'github-hosted',
  },
};
test('publication permits the exact committed main target only', () => {
  assert.doesNotThrow(() => assertReleaseContext(context));
  for (const change of [
    { target: '0.0.0' },
    { remoteMain: 'b'.repeat(40) },
    { dirty: true },
    { version: '1.0.1-rc.1' },
    { mode: 'oops' },
    { channel: 'stable', version: '1.0.0' },
  ])
    assert.throws(() => assertReleaseContext({ ...context, ...change }));
  for (const [key, value] of [
    ['GITHUB_REF', 'refs/heads/feat/v1'],
    ['GITHUB_EVENT_NAME', 'pull_request'],
    ['GITHUB_REPOSITORY', 'attacker/repo'],
    ['GITHUB_SHA', 'b'.repeat(40)],
    ['GITHUB_WORKFLOW_REF', 'hanselhansel/robopomelo/.github/workflows/other.yml@refs/heads/main'],
    ['RUNNER_ENVIRONMENT', 'self-hosted'],
  ])
    assert.throws(() =>
      assertReleaseContext({ ...context, environment: { ...context.environment, [key]: value } }),
    );
  assert.doesNotThrow(() =>
    assertReleaseContext({ ...context, mode: 'publish', channel: 'stable', version: '1.0.0' }),
  );
});
