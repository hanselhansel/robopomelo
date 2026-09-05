import { afterEach, describe, expect, it } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionFixture, snapshot, commitInput, actor } from './helpers/session-fixture.js';
import { mutationDigest } from '../../packages/project-fs/src/transactions/digest.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function fixture(...options: Parameters<typeof sessionFixture>) {
  const f = await sessionFixture(...options);
  cleanup.push(f.close);
  return f;
}
describe('internal proposal application and explicit recovery retirement', () => {
  it('applies a stored restore operation through the restore evaluator', async () => {
    const f = await fixture();
    const first = await snapshot(f.session);
    await f.session.commit(commitInput(first, 'changed', f.authorization));
    const current = await snapshot(f.session);
    const review = f.trust.authorizeRun(
      { ...f.root.identity(), projectId: 'project-1' },
      ['inspect', 'author'],
      'review-each-change',
    );
    const expected = { sourceRevision: current.sourceRevision, sourceHash: current.sourceHash };
    const proposal = await f.session.restore(first.sourceRevision, {
      expected,
      idempotencyKey: 'restore-proposal',
      authorization: review,
      actor,
      purpose: 'Restore original authoring',
    });
    if (proposal.kind !== 'proposal') throw new Error('Expected proposal');
    const result = await f.session.applyStoredProposal(proposal.proposalId, {
      expected,
      authorization: review,
      approvedPatchDigest: proposal.patchDigest,
    });
    expect(result.kind).toBe('committed');
    expect((await snapshot(f.session)).deployment.project.name).toBe('Original');
  });
  it('applies stored reconciliation with its original identity and preserves superseded proposals', async () => {
    const f = await fixture();
    await snapshot(f.session);
    const before = (await readFile(join(f.path, 'deployment.yaml'), 'utf8')).replace(
      'name: Original',
      'name: External',
    );
    await writeFile(join(f.path, 'deployment.yaml'), before);
    const current = await snapshot(f.session);
    const review = f.trust.authorizeRun(
      { ...f.root.identity(), projectId: 'project-1' },
      ['inspect', 'author'],
      'review-each-change',
    );
    const proposal = await f.session.reconcileExternal(current.sourceHash, actor, review);
    if (proposal.kind !== 'proposal') throw new Error('Expected proposal');
    const result = await f.session.applyStoredProposal(proposal.proposalId, {
      expected: { sourceRevision: current.sourceRevision, sourceHash: current.sourceHash },
      authorization: review,
      approvedPatchDigest: proposal.patchDigest,
    });
    expect(result.kind).toBe('committed');
    expect((await snapshot(f.session)).deployment.project.name).toBe('External');
    expect((await f.session.historyList()).some((entry) => entry.origin === 'external')).toBe(true);
  });
  it('retires only a validated uncommitted attempt without deleting staging or reusing its ID', async () => {
    const f = await fixture({
      onProgress: async ({ phase }) => {
        if (phase === 'journal-flushed') throw new Error('interrupted');
      },
    });
    const original = await snapshot(f.session);
    const input = commitInput(original, 'retire', f.authorization);
    await expect(f.session.commit(input)).rejects.toThrow('interrupted');
    const before = await f.root.list('.robopomelo/recovery');
    await f.session.retirePrepared('retire', mutationDigest(input), {
      authorization: f.authorization,
      actor,
      reason: 'Discard the uncommitted attempt',
    });
    expect(await f.session.mutationStatus('retire', mutationDigest(input))).toMatchObject({
      status: 'retired',
      reason: 'Discard the uncommitted attempt',
    });
    expect(await f.root.list('.robopomelo/recovery')).toEqual(before);
    expect((await snapshot(f.session)).sourceHash).toBe(original.sourceHash);
    await expect(f.session.commit(input)).rejects.toMatchObject({ code: 'MUTATION_RETIRED' });
  });
  it('cannot retire committed or unknown-source attempts and requires author authority', async () => {
    const f = await fixture();
    const input = commitInput(await snapshot(f.session), 'committed', f.authorization);
    await f.session.commit(input);
    await expect(
      f.session.retirePrepared('committed', mutationDigest(input), {
        authorization: f.authorization,
        actor,
        reason: 'Too late',
      }),
    ).rejects.toThrow();
    const blocked = await fixture({
      onProgress: async ({ phase }) => {
        if (phase === 'journal-flushed') throw new Error('interrupted');
      },
    });
    const pending = commitInput(await snapshot(blocked.session), 'pending', blocked.authorization);
    await expect(blocked.session.commit(pending)).rejects.toThrow();
    const inspect = blocked.trust.authorizeRun(
      { ...blocked.root.identity(), projectId: 'project-1' },
      ['inspect'],
      'autonomous',
    );
    await expect(
      blocked.session.retirePrepared('pending', mutationDigest(pending), {
        authorization: inspect,
        actor,
        reason: 'No authority',
      }),
    ).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
    await writeFile(join(blocked.path, 'deployment.yaml'), 'external: [');
    await expect(
      blocked.session.retirePrepared('pending', mutationDigest(pending), {
        authorization: blocked.authorization,
        actor,
        reason: 'Unknown state',
      }),
    ).rejects.toThrow();
  });
});
