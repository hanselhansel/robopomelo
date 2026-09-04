import { createHash } from 'node:crypto';
import type { CompatibilityProbe, RuntimeManifest } from '../../../apps/cli/src/runtime/contracts.js';
import { skillNames } from '../../../packages/spec/src/capabilities.js';
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export function runtimeFiles(version = '1.0.0'): Record<string, string> {
  return {
    'package.json': JSON.stringify({ name: 'robopomelo', version, type: 'module' }),
    'runtime/main.mjs': `export const version=${JSON.stringify(version)};`,
    'ui/index.html': '<!doctype html><title>Planning</title>',
    ...Object.fromEntries(skillNames.map((id) => [`skills/${id}/SKILL.md`, `# ${id}\n`])),
  };
}
export function manifest(version = '1.0.0'): RuntimeManifest {
  const files = runtimeFiles(version);
  return {
    formatVersion: 1,
    packageName: 'robopomelo',
    version,
    channel: version.includes('-') ? 'candidate' : 'stable',
    launcherProtocol: 1,
    nodeRange: '^22.22.2 || ^24.15.0',
    specRange: '^1.0.0',
    ruleSetRange: '^1.0.0',
    platforms: ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'],
    migrationRequired: false,
    entryPoint: 'runtime/main.mjs',
    files: Object.entries(files).map(([path, text]) => ({
      path,
      size: Buffer.byteLength(text),
      sha256: digest(text),
    })),
    skills: skillNames.map((id) => ({ id, path: `skills/${id}/SKILL.md` })),
    webAssets: ['ui/index.html'],
  };
}
export const probe = (): CompatibilityProbe => ({
  nodeVersion: '24.20.0',
  platform: 'darwin',
  arch: 'arm64',
  specVersion: '1.0.0',
  ruleSetVersion: '1.0.0',
  launcherProtocol: 1,
});
