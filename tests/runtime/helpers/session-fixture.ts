import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { createBlankProject } from '@robopomelo/core';
import type { PatchOperation, ProjectSnapshot } from '@robopomelo/spec';
import { SafeRoot } from '../../../packages/project-fs/src/fs/safe-fs.js';
import { SettingsStore } from '../../../packages/project-fs/src/settings/store.js';
import { TrustStore } from '../../../packages/project-fs/src/settings/trust.js';
import { ProjectSession } from '../../../packages/project-fs/src/session.js';
import type { CommitInput, SessionOptions } from '../../../packages/project-fs/src/contracts.js';

export const actor = { kind: 'human' as const, name: 'Planner' };
export async function sessionFixture(options: Partial<SessionOptions> = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'rp-session-')));
  const path = join(base, 'project');
  await mkdir(path);
  const root = await SafeRoot.open(path);
  const source = createBlankProject({
    id: 'project-1',
    name: 'Original',
    revision: 'rev-0',
    timestamp: '2026-09-05T00:00:00.000Z',
  });
  source.extensions = { acme: { code: '001', flag: false } };
  await writeFile(join(path, 'deployment.yaml'), '# project comment\n' + stringify(source));
  const trust = new TrustStore(new SettingsStore(join(base, 'config')));
  const authorization = trust.authorizeRun(
    { ...root.identity(), projectId: source.project.id },
    ['inspect', 'author', 'evidence', 'record-decisions'],
    'autonomous',
  );
  let id = 0;
  const session = new ProjectSession({
    root,
    trust,
    authorization,
    projectId: source.project.id,
    toolVersion: '0.0.0',
    clock: () => '2026-09-05T01:00:00.000Z',
    id: () => `generated-${++id}`,
    ...options,
  });
  return {
    base,
    path,
    root,
    trust,
    authorization,
    session,
    source,
    close: async () => {
      await session.close();
      await rm(base, { recursive: true, force: true });
    },
  };
}
export async function snapshot(session: ProjectSession): Promise<ProjectSnapshot> {
  const result = await session.open();
  if (result.kind !== 'readable') throw new Error('Fixture source is not readable');
  return result.snapshot;
}
export function commitInput(
  base: ProjectSnapshot,
  id: string,
  authorization: CommitInput['authorization'],
  operations: PatchOperation[] = [{ op: 'project', fields: { name: 'Updated' } }],
): CommitInput {
  return {
    expected: { sourceRevision: base.sourceRevision, sourceHash: base.sourceHash },
    idempotencyKey: id,
    authorization,
    actor,
    mutation: {
      kind: 'patch',
      patch: {
        formatVersion: '1.0.0',
        id,
        projectId: base.deployment.project.id,
        baseRevision: base.sourceRevision,
        baseHash: base.sourceHash,
        actor,
        purpose: 'Improve the plan',
        operations,
      },
    },
  };
}
