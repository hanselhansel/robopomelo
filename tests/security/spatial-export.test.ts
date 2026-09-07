import { describe, expect, it } from 'vitest';
import { buildIsaacExport, IsaacExportError, RUN_PY, validateMemberPaths, assertSafeCustomData, renderUsda, planIsaacExport } from '../../packages/isaac-export/src/index.js';
import { runnableFixture, input, robot, text, member } from '../isaac/fixture.js';

const code = (fn: () => unknown): string => {
  try { fn(); } catch (e) { return e instanceof IsaacExportError ? e.code : `other:${String(e)}`; }
  return 'no-error';
};
describe('USD injection and prim naming', () => {
  it('two instance ids that sanitize to the same prim name are rejected', () => {
    const ext = runnableFixture();
    ext.scenes[0]!.instances.push({ ...ext.scenes[0]!.instances[0]!, id: 'rack.1' });
    expect(code(() => buildIsaacExport(input(ext)))).toBe('PRIM_NAME_COLLISION');
  });
  it('a plain id that collides with a robot prim name is rejected', () => {
    const ext = runnableFixture();
    ext.scenes[0]!.instances.push({ ...ext.scenes[0]!.instances[0]!, id: 'robot_robot_a' });
    expect(code(() => buildIsaacExport(input(ext)))).toBe('PRIM_NAME_COLLISION');
  });
  it.each(['evil@Isaac/x.usd@', 'a\nstring "x" = "y"', 'a</Xform>', 'a>b', 'quote"x', 'back\\slash'])('rejects customData text %j', (bad) => {
    expect(code(() => assertSafeCustomData(bad, 'instanceId'))).toBe('UNSAFE_TEXT');
    const ext = runnableFixture();
    ext.scenes[0]!.instances[0]!.id = bad;
    expect(code(() => buildIsaacExport(input(ext)))).toBe('UNSAFE_TEXT');
  });
  it('robot references use only the profile relative path; no absolute path, URL or user text', () => {
    const usda = text(member(buildIsaacExport(input(runnableFixture())).members, 'isaac/scene.usda').bytes);
    const references = [...usda.matchAll(/references = @([^@]*)@/g)].map((m) => m[1]);
    expect(references).toEqual(['Isaac/Robots/NVIDIA/Jetbot/jetbot.usd', 'Isaac/Robots/NVIDIA/Jetbot/jetbot.usd']);
    expect(usda).not.toMatch(/@\/|@[a-z]+:\/\/|omniverse:|https?:/);
    const plan = planIsaacExport(input(runnableFixture()));
    const forged = { ...plan, robots: plan.robots.map((r) => ({ ...r, usdRelativePath: '/etc/passwd' })) };
    expect(code(() => renderUsda(forged))).toBe('REFERENCE_NOT_ALLOWED');
  });
  it('importable-only exports carry no references at all', () => {
    const ext = runnableFixture();
    ext.scenarios[0]!.workload = null;
    const usda = text(member(buildIsaacExport(input(ext)).members, 'isaac/scene.usda').bytes);
    expect(usda).not.toContain('references');
    expect(usda).not.toContain('jetbot.usd');
  });
});
describe('member paths', () => {
  const m = (path: string) => ({ path, mediaType: 'text/plain', bytes: new Uint8Array(0) });
  it('accepts only lowercase relative paths under isaac/', () => {
    expect(() => validateMemberPaths([m('isaac/a.json'), m('isaac/sub/b-c_d.usda')])).not.toThrow();
    for (const bad of ['isaac/../x', '../isaac/x', '/isaac/x', 'isaac//x', 'isaac/x/', 'other/x', 'isaac/A.json', 'isaac/x y', 'isaac/x\u0000', 'isaac/./x', 'isaac/x\\y', 'isaac/x%2e%2e/y'])
      expect(code(() => validateMemberPaths([m(bad)])), bad).toBe('PATH_INVALID');
  });
  it('rejects case-insensitive duplicates', () => {
    expect(code(() => validateMemberPaths([m('isaac/scene.usda'), m('isaac/scene.usda')]))).toBe('PATH_COLLISION');
    expect(code(() => validateMemberPaths([{ ...m('isaac/scene.usda'), path: 'isaac/Scene.usda' }, m('isaac/scene.usda')], { allowUppercase: true }))).toBe('PATH_COLLISION');
  });
  it('every exported member path is validated', () => {
    for (const { path } of buildIsaacExport(input(runnableFixture())).members) {
      expect(path.startsWith('isaac/')).toBe(true);
      expect(path).toMatch(/^[a-z0-9._\-/]+$/);
      expect(path).not.toContain('..');
    }
  });
});
describe('run.py runtime constraints', () => {
  it('contains no network access primitives', () => {
    for (const forbidden of ['http', 'socket', 'urllib', 'requests', 'subprocess', 'ftp', 'import os']) expect(RUN_PY, forbidden).not.toContain(forbidden);
  });
  it('never teleports after the init marker', () => {
    const marker = '# --- runtime: no teleportation below this line ---';
    const at = RUN_PY.indexOf(marker);
    expect(at).toBeGreaterThan(0);
    expect(RUN_PY.slice(at + marker.length)).not.toContain('set_world_pose');
    expect(RUN_PY.slice(0, at)).toContain('set_world_pose');
  });
  it('loads only sibling files and exits non-zero on threshold violation', () => {
    expect(RUN_PY).toContain('scenario.json');
    expect(RUN_PY).toContain('scene.usda');
    expect(RUN_PY).toContain('result.json');
    expect(RUN_PY).toMatch(/sys\.exit\(1\)/);
    expect(RUN_PY).not.toMatch(/\/home\/|\/Users\//);
  });
});
