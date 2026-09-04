import semver from 'semver';
import { skillNames } from '../../../../packages/spec/src/capabilities.js';
import { portableNameKey, projectRelativePath } from '../../../../packages/project-fs/src/fs/paths.js';
import { RuntimeError } from './errors.js';
import type { RuntimeManifest } from './contracts.js';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, k: string[]) => Object.keys(v).sort().join() === k.sort().join();
function fail(): never {
  throw new RuntimeError('RUNTIME_MANIFEST_INVALID', 'Runtime manifest is incomplete or invalid.');
}
export function parseRuntimeManifest(input: unknown): RuntimeManifest {
  if (
    !object(input) ||
    !keys(input, [
      'formatVersion',
      'packageName',
      'version',
      'channel',
      'launcherProtocol',
      'nodeRange',
      'specRange',
      'ruleSetRange',
      'platforms',
      'migrationRequired',
      'entryPoint',
      'files',
      'skills',
      'webAssets',
    ]) ||
    input.formatVersion !== 1 ||
    input.packageName !== 'robopomelo' ||
    typeof input.version !== 'string' ||
    !semver.valid(input.version) ||
    input.version.length > 40 ||
    input.launcherProtocol !== 1 ||
    typeof input.migrationRequired !== 'boolean' ||
    typeof input.entryPoint !== 'string'
  )
    fail();
  for (const key of ['nodeRange', 'specRange', 'ruleSetRange'])
    if (typeof input[key] !== 'string' || !semver.validRange(input[key])) fail();
  if (input.channel !== (semver.prerelease(input.version) ? 'candidate' : 'stable')) fail();
  if (
    !Array.isArray(input.platforms) ||
    !input.platforms.length ||
    input.platforms.length > 20 ||
    input.platforms.some((p) => typeof p !== 'string' || !/^(darwin|linux|win32)-(x64|arm64)$/.test(p))
  )
    fail();
  if (!Array.isArray(input.files) || !input.files.length || input.files.length > 10000) fail();
  const paths = new Set<string>(),
    portable = new Set<string>();
  let total = 0;
  for (const f of input.files) {
    if (
      !object(f) ||
      !keys(f, ['path', 'size', 'sha256']) ||
      typeof f.path !== 'string' ||
      f.path === 'runtime-manifest.json' ||
      !Number.isSafeInteger(f.size) ||
      Number(f.size) < 0 ||
      Number(f.size) > 64 * 1024 * 1024 ||
      typeof f.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(f.sha256)
    )
      fail();
    const path = projectRelativePath(f.path),
      key = portableNameKey(path);
    if (paths.has(path) || portable.has(key)) fail();
    paths.add(path);
    portable.add(key);
    total += Number(f.size);
  }
  if (
    total > 256 * 1024 * 1024 ||
    !paths.has(input.entryPoint) ||
    !paths.has('package.json') ||
    !input.entryPoint.endsWith('.mjs')
  )
    fail();
  if (
    !Array.isArray(input.skills) ||
    input.skills.length !== skillNames.length ||
    new Set(input.skills.map((s) => (object(s) ? s.id : null))).size !== skillNames.length
  )
    fail();
  for (const s of input.skills)
    if (
      !object(s) ||
      !keys(s, ['id', 'path']) ||
      !skillNames.includes(s.id as (typeof skillNames)[number]) ||
      typeof s.path !== 'string' ||
      !s.path.startsWith('skills/') ||
      !paths.has(s.path)
    )
      fail();
  if (
    !Array.isArray(input.webAssets) ||
    !input.webAssets.length ||
    input.webAssets.some((p) => typeof p !== 'string' || !paths.has(p)) ||
    new Set(input.webAssets).size !== input.webAssets.length
  )
    fail();
  return structuredClone(input) as unknown as RuntimeManifest;
}
