import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
const workflow = async (name) => parse(await readFile(`.github/workflows/${name}.yml`, 'utf8'));
test('CI always aggregates the complete required job set without path filtering', async () => {
  const ci = await workflow('ci');
  assert.deepEqual(ci.jobs['required-ci'].needs, ['source', 'native', 'browser']);
  assert.equal(ci.jobs['required-ci'].if, '${{ always() }}');
  for (const event of ['pull_request', 'push']) assert.equal(ci.on[event]?.paths, undefined);
  assert.equal(ci.on.pull_request_target, undefined);
});
test('native matrix covers exact runtime floors and current patches on each supported platform', async () => {
  const d = await workflow('distribution');
  const m = d.jobs.native.strategy.matrix;
  assert.deepEqual(m.os, ['ubuntu-24.04', 'windows-2025', 'macos-15', 'macos-15-intel']);
  assert.deepEqual(m.node, ['22.22.2', '22', '24.15.0', '24']);
  const commands = d.jobs.native.steps.map((step) => step.run ?? '').join('\n');
  assert.match(commands, /npm rebuild node-pty/);
  assert.match(commands, /prepare-terminal\.mjs/);
  assert.match(commands, /verify-terminal\.mjs/);
  assert.equal(d.jobs.native.strategy['fail-fast'], false);
  assert.equal(d.jobs['required-distribution'].if, '${{ always() }}');
});
test('release is manual, gates signing and publication, and never promotes latest', async () => {
  const r = await workflow('release');
  assert.deepEqual(Object.keys(r.on), ['workflow_dispatch']);
  assert.deepEqual(r.on.workflow_dispatch.inputs.mode.options, ['bootstrap', 'publish']);
  assert.deepEqual(r.jobs.deliver.needs, ['guard', 'verification']);
  assert.equal(r.jobs.deliver.permissions['id-token'], 'write');
  assert.equal(r.permissions['id-token'], undefined);
  const source = await readFile('.github/workflows/release.yml', 'utf8');
  assert.doesNotMatch(source, /--tag\s+latest|dist-tag\s+add|NPM_TOKEN|NODE_AUTH_TOKEN/);
  assert.match(source, /prepare-bootstrap\.mjs/);
  assert.match(source, /verify-release\.mjs/);
  assert.match(source, /--provenance --access public --tag/);
});
test('all external actions use reviewed full immutable commits', async () => {
  for (const name of ['ci', 'distribution', 'release']) {
    const w = await workflow(name);
    for (const job of Object.values(w.jobs))
      for (const step of job.steps ?? [])
        if (step.uses)
          assert.match(step.uses, /^actions\/(?:checkout|setup-node|upload-artifact)@[a-f0-9]{40}$/);
  }
});
