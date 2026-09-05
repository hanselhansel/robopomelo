import { afterEach, describe, expect, it } from 'vitest';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionFixture, snapshot, commitInput } from './helpers/session-fixture.js';
import { ProjectSession } from '../../packages/project-fs/src/session.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture(...args: Parameters<typeof sessionFixture>) {
  const f = await sessionFixture(...args);
  cleanup.push(f.close);
  return f;
}

describe('project sessions', () => {
  it('recognizes a committed sibling session change without requesting external reconciliation', async () => {
    const f = await fixture();
    const base = await snapshot(f.session);
    const sibling = new ProjectSession(f.session.options);
    await sibling.commit(commitInput(base, 'sibling-change', f.authorization));
    expect(await f.session.open()).toMatchObject({ kind: 'readable', externalEdit: false });
  });
  it('opens and previews without altering source or creating history/lock directories', async () => {
    const { session, path, authorization } = await fixture();
    const base = await snapshot(session);
    const before = await readFile(join(path, 'deployment.yaml'));
    const result = await session.preview(commitInput(base, 'preview', authorization));
    expect(result.deployment.project.name).toBe('Updated');
    expect(await readFile(join(path, 'deployment.yaml'))).toEqual(before);
    expect(await readdir(path)).toEqual(['deployment.yaml']);
  });
  it('commits the exact candidate preserving comments, extensions and history', async () => {
    const { session, path, authorization } = await fixture();
    const base = await snapshot(session);
    const committed = await session.commit(commitInput(base, 'change-1', authorization));
    expect(committed.kind).toBe('committed');
    const after = await snapshot(session);
    expect(after.deployment.project.name).toBe('Updated');
    expect(after.deployment.meta.parentRevisionId).toBe(base.sourceRevision);
    expect(after.deployment.extensions).toEqual(base.deployment.extensions);
    expect(await readFile(join(path, 'deployment.yaml'), 'utf8')).toContain('# project comment');
    expect((await session.historyList()).map((item) => item.sourceRevision)).toContain(base.sourceRevision);
    expect((await session.historyRead(base.sourceRevision)).snapshot.sourceHash).toBe(base.sourceHash);
  });
  it('rejects stale revision/hash while returning current identities and preserving pending input', async () => {
    const { session, authorization } = await fixture();
    const old = await snapshot(session);
    await session.commit(commitInput(old, 'first', authorization));
    const pending = commitInput(old, 'stale', authorization, [
      { op: 'project', fields: { name: 'Pending' } },
    ]);
    const conflict = await session.commit(pending);
    expect(conflict).toMatchObject({
      kind: 'conflict',
      expected: pending.expected,
      mutation: pending.mutation,
    });
    expect(conflict).toMatchObject({
      proposedDiff: [{ collection: 'project', field: 'name', before: 'Original', after: 'Pending' }],
    });
    expect((await snapshot(session)).deployment.project.name).toBe('Updated');
  });
  it('preserves malformed external bytes in inspection state and blocks mutation', async () => {
    const { session, path, authorization } = await fixture();
    const base = await snapshot(session);
    await writeFile(join(path, 'deployment.yaml'), 'project: [');
    expect(await session.open()).toMatchObject({
      kind: 'inspection',
      rawText: 'project: [',
      lastReadable: { sourceHash: base.sourceHash },
    });
    await expect(session.commit(commitInput(base, 'bad-source', authorization))).rejects.toMatchObject({
      code: 'SOURCE_UNREADABLE',
    });
    expect(await readFile(join(path, 'deployment.yaml'), 'utf8')).toBe('project: [');
  });
  it('rechecks authority immediately before replacement after preparation', async () => {
    const f = await fixture({
      onProgress: async ({ phase }) => {
        if (phase === 'journal-flushed') await f.trust.revokeRun(f.authorization.grantId);
      },
    });
    const base = await snapshot(f.session);
    await expect(f.session.commit(commitInput(base, 'revoked', f.authorization))).rejects.toMatchObject({
      code: 'GRANT_REVOKED',
    });
    expect(await readFile(join(f.path, 'deployment.yaml'), 'utf8')).toContain('name: Original');
  });
  it('requires explicit reconciliation before a normal mutation adopts externally edited content', async () => {
    const { session, path, authorization } = await fixture();
    await snapshot(session);
    const raw = (await readFile(join(path, 'deployment.yaml'), 'utf8')).replace(
      'name: Original',
      'name: External',
    );
    await writeFile(join(path, 'deployment.yaml'), raw);
    const external = await snapshot(session);
    await expect(
      session.commit(commitInput(external, 'implicit-adoption', authorization)),
    ).rejects.toMatchObject({ code: 'EXTERNAL_RECONCILIATION_REQUIRED' });
  });
});
