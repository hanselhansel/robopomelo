import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { metadataReport, metadataArguments } from '../../scripts/provider-metadata.mjs';

test('metadata can never claim authenticated or contained project access', () => {
  const report = metadataReport('codex', 'codex-cli 0.153.4\n', '--stdio --sandbox --json-schema');
  assert.equal(report.version, '0.153.4');
  assert.equal(report.authenticationVerified, false);
  assert.equal(report.containmentVerified, false);
  assert.equal(report.projectAccessAllowed, false);
});

test('metadata rejects unknown providers and malformed versions without reflecting output', () => {
  assert.throws(() => metadataArguments('shell'), /Unsupported provider/);
  for (const output of ['TOKEN=private', '0.153.4 private-secret', '', '1.2']) {
    assert.throws(() => metadataReport('codex', output, ''), error => {
      assert.equal(error.message, 'Provider version response is invalid');
      assert.ok(!error.message.includes('private'));
      return true;
    });
  }
});

test('metadata reports only a closed list of documented flags', () => {
  const report = metadataReport('grok', 'grok 1.0.13 (5e9a58528b76) [stable]\n',
    '--json-schema --disable-web-search --no-subagents --max-turns --tools\nSECRET=private');
  assert.deepEqual(report.flags, ['--disable-web-search', '--json-schema', '--max-turns', '--no-subagents', '--tools']);
  assert.ok(!JSON.stringify(report).includes('private'));
  assert.equal(report.projectAccessAllowed, false);
});

test('metadata arguments never start a model session or permit caller-supplied commands', () => {
  assert.deepEqual(metadataArguments('codex'), [['--version'], ['app-server', '--help']]);
  assert.deepEqual(metadataArguments('grok'), [['--version'], ['--help']]);
  assert.throws(() => metadataArguments('../grok'), /Unsupported provider/);
});

test('the probe rejects live and arbitrary provider modes before running a CLI', () => {
  const script = fileURLToPath(new URL('../../scripts/probe-provider-contracts.mjs', import.meta.url));
  for (const args of [['--provider','codex','--mode','live'], ['--provider','../shell']]) {
    const result = spawnSync(process.execPath, [script,...args], {
      encoding: 'utf8', env: { PATH: '' }, timeout: 2000,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'PROVIDER_METADATA_FAILED');
  }
});

test('flag names embedded in other names are not reported as supported', () => {
  const report = metadataReport('codex','codex-cli 0.153.4','--tools-evil prefix--sandbox');
  assert.deepEqual(report.flags, []);
});
