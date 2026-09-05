import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
export function artifactVersion(target, channel) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(target))
    throw new Error('Release target must be a three-part stable version.');
  if (!['stable', 'candidate'].includes(channel)) throw new Error('Choose stable or candidate channel.');
  return channel === 'candidate' ? `${target}-rc.1` : target;
}
export function makeManifest(version, channel, files) {
  return {
    formatVersion: 1,
    packageName: 'robopomelo',
    version,
    channel,
    launcherProtocol: 1,
    nodeRange: '^22.22.2 || ^24.15.0',
    specRange: '^1.0.0',
    ruleSetRange: '^1.0.0',
    platforms: ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64'],
    migrationRequired: false,
    entryPoint: 'runtime/main.mjs',
    files,
    skills: files
      .filter((file) => /^skills\/[^/]+\/SKILL.md$/.test(file.path))
      .map((file) => ({ id: file.path.split('/')[1], path: file.path })),
    webAssets: files.filter((file) => file.path.startsWith('ui/')).map((file) => file.path),
  };
}
export async function inventory(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Distribution cannot include symbolic links.');
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (path === 'runtime-manifest.json') continue;
    if (entry.isDirectory()) result.push(...(await inventory(directory, path)));
    else if (entry.isFile()) {
      const bytes = await readFile(join(directory, path));
      result.push({ path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } else throw new Error(`Unsupported distribution entry ${path}`);
  }
  return result.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
