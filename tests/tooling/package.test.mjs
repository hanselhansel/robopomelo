import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artifactVersion, makeManifest } from '../../scripts/release-manifest.mjs';
test('derives the approved RC and stable identities from a three-part release target', () => {
  assert.equal(artifactVersion('1.0.0', 'candidate'), '1.0.0-rc.1');
  assert.equal(artifactVersion('1.0.0', 'stable'), '1.0.0');
  assert.throws(() => artifactVersion('1.0.0-rc.1', 'stable'));
});
test('declares the package runtime handshake and supported platforms explicitly', () => {
  const manifest = makeManifest('1.0.0', 'stable', []);
  assert.equal(manifest.entryPoint, 'runtime/main.mjs');
  assert.equal(manifest.launcherProtocol, 1);
  assert.deepEqual(manifest.platforms, ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64']);
  assert.equal(manifest.migrationRequired, false);
});
