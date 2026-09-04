import { expect, it } from 'vitest';
import { parseRuntimeManifest } from '../../apps/cli/src/runtime/manifest.js';
import { assertCompatible, automaticEligible } from '../../apps/cli/src/runtime/compatibility.js';
import { manifest, probe } from './helpers/runtime.js';
it('requires all six Skills, assets and an exact inventory before executing a runtime', () => {
  const m = manifest();
  expect(parseRuntimeManifest(m).version).toBe('1.0.0');
  for (const bad of [
    { ...m, skills: m.skills.slice(1) },
    { ...m, webAssets: [] },
    { ...m, entryPoint: '../escape' },
    { ...m, files: [...m.files, m.files[0]] },
  ])
    expect(() => parseRuntimeManifest(bad)).toThrow();
});
it('rejects incompatible Node, platform, specification, rule context, protocol and migration', () => {
  const m = manifest();
  expect(() => assertCompatible(m, probe())).not.toThrow();
  for (const p of [
    { ...probe(), nodeVersion: '20.0.0' },
    { ...probe(), platform: 'freebsd' },
    { ...probe(), specVersion: '2.0.0' },
    { ...probe(), ruleSetVersion: '2.0.0' },
    { ...probe(), launcherProtocol: 2 },
  ])
    expect(() => assertCompatible(m, p as ReturnType<typeof probe>)).toThrow();
  expect(() => assertCompatible({ ...m, migrationRequired: true }, probe())).toThrow();
});
it('automatically admits only newer compatible stable releases in the same major', () => {
  expect(automaticEligible(manifest('1.1.0'), '1.0.0', probe())).toBe(true);
  for (const m of [
    manifest('1.0.0'),
    manifest('2.0.0'),
    manifest('1.1.0-rc.1'),
    { ...manifest('1.1.0'), migrationRequired: true },
  ])
    expect(automaticEligible(m, '1.0.0', probe())).toBe(false);
});
