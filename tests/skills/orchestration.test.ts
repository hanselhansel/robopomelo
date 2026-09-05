import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import type { PatchEnvelope, PatchOperation, ProjectSnapshot } from '@robopomelo/spec';
import { skillNames } from '@robopomelo/spec';
import { stepOperations, backlinks } from './helpers/fixtures.js';
const cleanup: (() => Promise<unknown>)[] = [];
let driver: string;
beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), 'rp-skill-cli-'));
  driver = join(root, 'driver.cjs');
  await build({
    entryPoints: [fileURLToPath(new URL('./helpers/cli-driver.ts', import.meta.url))],
    outfile: driver,
    bundle: true,
    format: 'cjs',
    platform: 'node',
  });
  return async () => rm(root, { recursive: true, force: true });
});
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn();
});
interface Run {
  code: number;
  data: any;
  envelope: any;
}
async function fixture(mode = 'autonomous') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'rp-skill-run-'))),
    project = join(root, 'project');
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const run = (args: string[], input?: unknown): Promise<Run> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [driver, ...args, '--json', '--offline'], {
        env: { ...process.env, ROBOPOMELO_SKILL_TEST_CONFIG: join(root, 'config') },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '',
        stderr = '';
      child.stdout.setEncoding('utf8').on('data', (s) => {
        stdout += s;
      });
      child.stderr.setEncoding('utf8').on('data', (s) => {
        stderr += s;
      });
      child.on('error', reject);
      child.on('close', (code) => {
        try {
          const envelope = JSON.parse(stdout);
          resolve({ code: code ?? 1, data: envelope.data, envelope });
        } catch {
          reject(new Error(`Invalid CLI JSON: ${stderr}`));
        }
      });
      child.stdin.end(input === undefined ? '' : JSON.stringify(input));
    });
  // Explicit fixture setup grants authority. Skill command templates do not.
  expect((await run(['init', project, '--authorize', 'author'])).code).toBe(0);
  expect(
    (
      await run([
        'trust',
        'grant',
        '--project',
        project,
        '--scopes',
        'author',
        '--mode',
        mode,
        '--remember',
        '--authorize',
        'manage-settings',
      ])
    ).code,
  ).toBe(0);
  const show = async () => (await run(['show', '--project', project])).data as ProjectSnapshot;
  let counter = 0;
  const patch = (s: ProjectSnapshot, capabilityId: string, operations: PatchOperation[]): PatchEnvelope => ({
    formatVersion: '1.0.0',
    id: `skill-change-${++counter}`,
    projectId: s.deployment.project.id,
    baseRevision: s.sourceRevision,
    baseHash: s.sourceHash,
    actor: { kind: 'agent', name: 'Deterministic fixture agent' },
    purpose: 'Replay supplied fictional facts',
    capabilityId,
    operations,
  });
  return { root, project, run, show, patch };
}
describe('deterministic Skill CLI conformance (not an agent-host test)', () => {
  it('replays five narrow steps and dependent backlinks with fresh bases and honest unknowns', async () => {
    const f = await fixture();
    let source = await f.show();
    const stale = f.patch(source, skillNames[1], stepOperations[1]!);
    for (let index = 0; index < 5; index++) {
      const input = f.patch(source, skillNames[index]!, stepOperations[index]!);
      const before = await readFile(join(f.project, 'deployment.yaml'));
      for (const action of ['check', 'diff'])
        expect((await f.run(['patch', action, '-', '--project', f.project], input)).code).toBe(0);
      expect(await readFile(join(f.project, 'deployment.yaml'))).toEqual(before);
      const result = await f.run(['patch', 'apply', '-', '--project', f.project], input);
      expect(result.code).toBe(0);
      expect(result.data.status).toBe('applied');
      source = await f.show();
      if (index === 0)
        expect((await f.run(['patch', 'apply', '-', '--project', f.project], stale)).code).toBe(4);
    }
    for (const step of backlinks) {
      expect(
        (
          await f.run(
            ['patch', 'apply', '-', '--project', f.project],
            f.patch(source, step.capabilityId, step.operations),
          )
        ).code,
      ).toBe(0);
      source = await f.show();
    }
    expect(source.deployment.kpis[0]?.target).toMatchObject({
      state: 'unverified',
      value: { value: '12.50', unit: 'min' },
    });
    expect(source.deployment.acceptanceTests[0]?.criterion).toMatchObject({ state: 'unknown' });
    expect(source.deployment.review.approvals).toEqual([]);
    expect(source.deployment.requirements[0]?.testIds).toEqual(['planned-test']);
    const result = await f.run(['validate', '--project', f.project]);
    expect(result.code).toBe(3);
    expect(result.data.readiness).toBe('blocked');
  }, 30_000);
  it('keeps review-each-change source unchanged until an explicit fixture approval', async () => {
    const f = await fixture('review-each-change');
    const base = await f.show();
    const input = f.patch(base, skillNames[0], stepOperations[0]!);
    const proposed = await f.run(['patch', 'apply', '-', '--project', f.project], input);
    expect(proposed.code).toBe(0);
    expect(proposed.data.status).toBe('proposed');
    expect((await f.show()).sourceHash).toBe(base.sourceHash);
    const applied = await f.run([
      'patch',
      'apply',
      '--proposal',
      proposed.data.proposalId,
      '--digest',
      proposed.data.patchDigest,
      '--base-revision',
      base.sourceRevision,
      '--base-hash',
      base.sourceHash,
      '--project',
      f.project,
    ]);
    expect(applied.code).toBe(0);
    expect(applied.data.status).toBe('applied');
    expect((await f.show()).deployment.review.approvals).toEqual([]);
  }, 15_000);
  it('rejects narrow-scope expansion and unsupplied human decisions through the actual CLI', async () => {
    const f = await fixture();
    const source = await f.show();
    const outside = f.patch(source, 'define-deployment-kpis', stepOperations[0]!);
    expect((await f.run(['patch', 'check', '-', '--project', f.project], outside)).code).toBe(5);
    const unrecognized = f.patch(source, 'gazebo', []);
    expect((await f.run(['patch', 'check', '-', '--project', f.project], unrecognized)).code).toBe(7);
    const reviewWrite = f.patch(source, 'plan-amr-deployment', [
      { op: 'project', fields: { review: { currentApprovalId: 'invented' } } },
    ]);
    expect((await f.run(['patch', 'apply', '-', '--project', f.project], reviewWrite)).code).not.toBe(0);
    expect((await f.show()).sourceHash).toBe(source.sourceHash);
  }, 15_000);
});
