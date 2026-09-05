import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { assertSuccessfulJobs } from '../../scripts/check-plan-coverage.mjs';
import { assertReleaseContext } from '../../scripts/verify-versions.mjs';
const sha = 'a'.repeat(40);
const context = {
  target: '1.0.0',
  version: '1.0.0-rc.1',
  channel: 'candidate',
  expectedCommit: sha,
  head: sha,
  remoteMain: sha,
  dirty: false,
  environment: {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REPOSITORY: 'hanselhansel/robopomelo',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    RUNNER_ENVIRONMENT: 'github-hosted',
    GITHUB_WORKFLOW_REF: 'hanselhansel/robopomelo/.github/workflows/published.yml@refs/heads/main',
  },
};
test('published source guard rejects unreviewed identities and version drift', async () => {
  const guard = await import('../../scripts/verify-published-context.mjs');
  assert.doesNotThrow(() => guard.assertPublishedContext(context));
  assert.throws(() => assertReleaseContext({ ...context, mode: 'publish' }));
  assert.doesNotThrow(() =>
    guard.assertPublishedContext({ ...context, channel: 'stable', version: '1.0.0' }),
  );
  for (const change of [
    { head: 'b'.repeat(40) },
    { remoteMain: 'b'.repeat(40) },
    { dirty: true },
    { expectedCommit: 'main' },
    { version: '1.0.1' },
    { target: '0.0.0' },
    { channel: 'latest' },
  ])
    assert.throws(() => guard.assertPublishedContext({ ...context, ...change }));
  for (const [key, value] of Object.entries({
    GITHUB_ACTIONS: 'false',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REPOSITORY: 'attacker/repo',
    GITHUB_REF: 'refs/heads/feature',
    GITHUB_SHA: 'b'.repeat(40),
    RUNNER_ENVIRONMENT: 'self-hosted',
    GITHUB_WORKFLOW_REF: 'hanselhansel/robopomelo/.github/workflows/release.yml@refs/heads/main',
  }))
    assert.throws(() =>
      guard.assertPublishedContext({ ...context, environment: { ...context.environment, [key]: value } }),
    );
});
test('published workflow verifies actual registry bytes on all sixteen read-only legs', async () => {
  const source = await readFile('.github/workflows/published.yml', 'utf8');
  const w = parse(source);
  assert.deepEqual(Object.keys(w.on), ['workflow_dispatch']);
  assert.deepEqual(w.on.workflow_dispatch.inputs.channel.options, ['candidate', 'stable']);
  for (const name of ['channel', 'version', 'commit'])
    assert.equal(w.on.workflow_dispatch.inputs[name].required, true);
  assert.deepEqual(w.permissions, { contents: 'read' });
  const native = w.jobs.native;
  assert.deepEqual(native.needs, ['guard']);
  assert.equal(native.defaults.run.shell, 'bash');
  assert.deepEqual(native.strategy.matrix.os, ['ubuntu-24.04', 'windows-2025', 'macos-15', 'macos-15-intel']);
  assert.deepEqual(native.strategy.matrix.node, ['22.22.2', '22', '24.15.0', '24']);
  assert.equal(native.strategy['fail-fast'], false);
  const verifier = native.steps.find((s) => s.run?.includes('verify-release.mjs'));
  assert.equal(
    verifier.run,
    'node scripts/verify-release.mjs --version "$VERSION" --commit "$COMMIT" --report test-results/published.json',
  );
  assert.deepEqual(verifier.env, { VERSION: '${{ inputs.version }}', COMMIT: '${{ inputs.commit }}' });
  assert.ok(native.steps.some((s) => s.run === 'npm ci --ignore-scripts'));
  const guard = w.jobs.guard.steps.find((s) => s.run?.includes('verify-published-context.mjs'));
  assert.match(guard.run, /--version "\$VERSION" --commit "\$COMMIT" --channel "\$CHANNEL"/);
  assert.equal(guard.env.CHANNEL, '${{ inputs.channel }}');
  for (const job of Object.values(w.jobs)) {
    assert.equal(job.permissions, undefined);
    for (const step of job.steps ?? []) {
      if (step.uses) assert.match(step.uses, /^actions\/(checkout|setup-node|upload-artifact)@[a-f0-9]{40}$/);
      if (step.uses?.startsWith('actions/checkout')) {
        assert.equal(step.with['persist-credentials'], false);
        assert.equal(step.with.ref, '${{ github.sha }}');
      }
    }
  }
  const upload = native.steps.find((s) => s.uses?.startsWith('actions/upload-artifact'));
  assert.equal(upload.if, '${{ always() }}');
  assert.match(upload.with.name, /matrix.os/);
  assert.match(upload.with.name, /strategy.job-index/);
  assert.equal(upload.with['if-no-files-found'], 'error');
  const aggregate = w.jobs['required-published'];
  assert.equal(aggregate.if, '${{ always() }}');
  assert.deepEqual(aggregate.needs, ['guard', 'native']);
  assert.ok(aggregate.steps.some((s) => s.run?.includes('--expected guard,native')));
  assert.doesNotMatch(
    source,
    /id-token|NPM_TOKEN|NODE_AUTH_TOKEN|npm publish|dist-tag|promote-release|build\.mjs|GITHUB_WORKFLOW_REF:/,
  );
});
test('published aggregate fails closed for skipped, missing, failed and cancelled jobs', () => {
  for (const job of ['guard', 'native'])
    for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
      const results = { guard: { result: 'success' }, native: { result: 'success' } };
      if (result) results[job] = { result };
      else delete results[job];
      assert.throws(() => assertSuccessfulJobs(results, ['guard', 'native']));
    }
});
