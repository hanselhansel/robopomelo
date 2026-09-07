import { afterEach, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SPATIAL_CAPABILITY, SPATIAL_NAMESPACE, type PatchOperation, type SpatialExtension } from '@robopomelo/spec';
import { sessionFixture, snapshot, commitInput } from './helpers/session-fixture.js';
const closers: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of closers.splice(0)) await close(); });
const asset = { id: 'asset-rack', version: '1.0.0', sha256: 'a'.repeat(64) };
const known = <T,>(value: T) => ({ state: 'known' as const, value, sourceIds: [] as string[] });
const spatial = (actions: unknown[]): PatchOperation[] => actions.map(action => ({ op: 'spatial', action }) as PatchOperation);
const setup: PatchOperation[] = spatial([
  { kind: 'activate', capability: SPATIAL_CAPABILITY },
  { kind: 'define-scene', scene: { id: 'scene-1', name: 'Receiving', floor: known({ lengthM: 60, widthM: 40 }) } },
  { kind: 'register-asset', asset },
  { kind: 'place', sceneId: 'scene-1', instance: { id: 'rack-1', asset, pose: { xM: 2, yM: 1, zM: 0, yawRad: 0 }, dimensions: known({ lengthM: 12, widthM: 1.2, heightM: 6 }), sourceIds: [] } },
]);
const ext = (value: unknown) => (value as { deployment: { extensions: Record<string, unknown> } }).deployment.extensions[SPATIAL_NAMESPACE] as SpatialExtension;
it('commits spatial actions through the YAML AST path, preserving comments and unrelated extensions, with replay-safe identity', async () => {
  const f = await sessionFixture(); closers.push(f.close);
  const base = await snapshot(f.session);
  const first = await f.session.commit(commitInput(base, 'spatial-1', f.authorization, setup));
  expect(first.kind).toBe('committed');
  const text = await readFile(join(f.path, 'deployment.yaml'), 'utf8');
  expect(text.startsWith('# project comment')).toBe(true);
  expect(text).toContain('acme:');
  expect(text).toContain('robopomelo.spatial:');
  expect(text).toContain('spatial-planning-v1');
  const replay = await f.session.commit(commitInput(base, 'spatial-1', f.authorization, setup));
  expect(replay.kind).toBe('committed');
  expect(replay.kind === 'committed' && replay.alreadyApplied).toBe(true);
  const after = await snapshot(f.session);
  expect(ext(after).scenes[0]!.instances).toHaveLength(1);
  expect(after.deployment.extensions.acme).toEqual({ code: '001', flag: false });
  // The fixture's unrelated `acme` extension keeps its RP-090 warning; the spatial namespace is known.
  expect(after.validation.findings.filter(finding => (finding.ruleId === 'RP-090' || finding.ruleId === 'RP-004') && finding.paths.some(path => path.includes('robopomelo')))).toEqual([]);
});
it('retains a stale spatial move as a conflict instead of applying it over a newer revision, and emits one operation per drag end', async () => {
  const f = await sessionFixture(); closers.push(f.close);
  const base = await snapshot(f.session);
  await f.session.commit(commitInput(base, 'spatial-1', f.authorization, setup));
  const v1 = await snapshot(f.session);
  const move = (id: string, xM: number) => spatial([{ kind: 'move', sceneId: 'scene-1', id: 'rack-1', pose: { xM, yM: 1, zM: 0, yawRad: 0 } }]);
  await f.session.commit(commitInput(v1, 'spatial-human', f.authorization, move('rack-1', 4)));
  const stale = await f.session.commit(commitInput(v1, 'spatial-agent-late', f.authorization, move('rack-1', 9)));
  expect(stale.kind).toBe('conflict');
  const current = await snapshot(f.session);
  expect(ext(current).scenes[0]!.instances[0]!.pose.xM).toBe(4);
  const single = await f.session.commit(commitInput(current, 'spatial-drag-end', f.authorization, move('rack-1', 6)));
  expect(single.kind).toBe('committed');
  expect(single.kind === 'committed' && single.diff.filter(row => row.collection === 'spatial.instances')).toHaveLength(1);
  expect(single.kind === 'committed' && single.diff.find(row => row.collection === 'spatial.instances')).toMatchObject({ id: 'rack-1', field: 'pose' });
});
it('refuses spatial writes without activation and without author authority, leaving the source untouched', async () => {
  const f = await sessionFixture(); closers.push(f.close);
  const base = await snapshot(f.session);
  await expect(f.session.commit(commitInput(base, 'spatial-noact', f.authorization, setup.slice(1)))).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
  const inspect = f.trust.authorizeRun({ ...f.root.identity(), projectId: f.source.project.id }, ['inspect'], 'autonomous');
  await expect(f.session.commit(commitInput(base, 'spatial-noauth', inspect, setup))).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
  const current = await snapshot(f.session);
  expect(current.sourceRevision).toBe(base.sourceRevision);
  expect(current.deployment.extensions[SPATIAL_NAMESPACE]).toBeUndefined();
});
