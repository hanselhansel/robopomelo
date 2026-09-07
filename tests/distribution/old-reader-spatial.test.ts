import { afterEach, expect, it } from 'vitest';
import { access, mkdtemp, mkdir, realpath, rm, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { createBlankProject } from '@robopomelo/core';
import { emptySpatialExtension, SPATIAL_CAPABILITY, SPATIAL_NAMESPACE } from '@robopomelo/spec';
/** G2: the actual published robopomelo@1.0.0 must refuse authoring, approval and
 * silent export of a project that requires the spatial capability. Install it
 * once into an isolated directory outside the repository:
 *   mkdir -p ~/.cache/robopomelo-build/old-reader && cd $_ && echo '{"private":true}' > package.json && npm install robopomelo@1.0.0 --ignore-scripts
 * or point ROBOPOMELO_OLD_READER at another installed bin/robopomelo.mjs. */
const binary = process.env.ROBOPOMELO_OLD_READER ?? join(process.env.HOME ?? '', '.cache/robopomelo-build/old-reader/node_modules/robopomelo/bin/robopomelo.mjs');
const available = await access(binary).then(() => true, () => false);
const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const base = await realpath(await mkdtemp(join('/private/tmp', 'rp-old-reader-')));
  cleanup.push(base);
  await mkdir(join(base, 'home')); await mkdir(join(base, 'project'));
  const d = createBlankProject({ id: 'project-old-reader', name: 'Old reader fixture', revision: 'rev-1', timestamp: '2026-09-07T00:00:00Z' });
  d.project.problem = { state: 'provided', value: 'Pallets wait at the dock.' };
  d.extensions['robopomelo.capabilities'] = { required: [SPATIAL_CAPABILITY] };
  const spatial = emptySpatialExtension();
  spatial.scenes.push({ id: 'scene-1', name: 'Receiving', floor: { state: 'known', value: { lengthM: 60, widthM: 40 }, sourceIds: [] }, instances: [] });
  d.extensions[SPATIAL_NAMESPACE] = spatial as never;
  const source = stringify(d);
  await writeFile(join(base, 'project', 'deployment.yaml'), source);
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [binary, ...args, '--project', join(base, 'project'), '--json', '--offline'], { cwd: base, env: { ...process.env, HOME: join(base, 'home'), XDG_CONFIG_HOME: join(base, 'home') }, encoding: 'utf8', timeout: 60_000 });
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}'); } catch { body = { raw: result.stdout, stderr: result.stderr }; }
    return { status: result.status, body, stderr: result.stderr };
  };
  return { base, source, run };
}
it.skipIf(!available)('published 1.0.0 blocks the spatial project with RP-004, preserves its bytes and refuses approval and quiet export', { timeout: 120_000 }, async () => {
  const f = await fixture();
  const validate = f.run('validate');
  expect(validate.body.toolVersion).toBe('1.0.0');
  const findings = validate.body.findings as { ruleId: string; severity: string; message: string; paths: string[] }[];
  const capability = findings.find(finding => finding.ruleId === 'RP-004');
  expect(capability, JSON.stringify(validate.body).slice(0, 500)).toBeDefined();
  expect(capability!.severity).toBe('blocker');
  expect(capability!.message + capability!.paths.join(' ')).toMatch(/spatial-planning-v1|robopomelo.capabilities/);
  expect((validate.body.data as { readiness?: string } | null)?.readiness ?? 'blocked').toBe('blocked');
  const show = f.run('show');
  expect(JSON.stringify(show.body)).toContain('robopomelo.spatial');
  expect(await readFile(join(f.base, 'project', 'deployment.yaml'), 'utf8')).toBe(f.source);
  const approve = f.run('review', 'approve', '--yes', '--authorize', 'record-decisions');
  expect(approve.status).not.toBe(0);
  expect(await readFile(join(f.base, 'project', 'deployment.yaml'), 'utf8')).toBe(f.source);
  const exported = f.run('export', '--format', 'files', '--no-evidence', '--authorize', 'export', '--yes');
  expect(JSON.stringify(exported.body)).toMatch(/blocked|RP-004|unsupported|spatial-planning-v1/i);
});
it.skipIf(available)('reports why the old-reader gate could not run', () => {
  console.warn('G2 old-reader test skipped: published robopomelo@1.0.0 is not installed at ' + binary);
  expect(available).toBe(false);
});
