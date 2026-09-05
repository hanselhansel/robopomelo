import { afterEach, describe, expect, it } from 'vitest';
import { sessionFixture, snapshot, commitInput } from './helpers/session-fixture.js';
import { mutationDigest, digestValue } from '../../packages/project-fs/src/transactions/digest.js';
import { proposalBase, jsonRead } from '../../packages/project-fs/src/transactions/io.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture(...args: Parameters<typeof sessionFixture>) {
  const f = await sessionFixture(...args);
  cleanup.push(f.close);
  return f;
}
describe('digest-bound mutation receipts and immutable proposals', () => {
  it('validates nested proposal actor/diff structure independently of its checksum', async () => {
    const f = await fixture();
    const review = f.trust.authorizeRun(
      { ...f.root.identity(), projectId: 'project-1' },
      ['inspect', 'author'],
      'review-each-change',
    );
    const result = await f.session.commit(commitInput(await snapshot(f.session), 'bad-proposal', review));
    if (result.kind !== 'proposal') throw new Error('Expected proposal');
    const path = `${proposalBase(result.proposalId)}.json`;
    const value = (await jsonRead(f.root, path)) as { request: { actor: unknown }; diff: unknown[] };
    value.request.actor = { kind: 'human', name: { invalid: true } };
    value.diff = [{ collection: 'project', id: 'project-1', field: 42, before: null, after: 'fake' }];
    await writeFile(join(f.path, path), JSON.stringify({ value, checksum: digestValue(value) }));
    await expect(f.session.proposalRead(result.proposalId)).rejects.toMatchObject({
      code: 'INVALID_PROPOSAL',
    });
  });
  it('replays a committed response against its immutable revision after a newer commit', async () => {
    const { session, authorization } = await fixture();
    const base = await snapshot(session);
    const input = commitInput(base, 'once', authorization);
    const first = await session.commit(input);
    const next = await snapshot(session);
    await session.commit(
      commitInput(next, 'later', authorization, [{ op: 'project', fields: { name: 'Later' } }]),
    );
    const replay = await session.commit(input);
    expect(first).toMatchObject({alreadyApplied:false});
    expect(replay).toEqual({...first,alreadyApplied:true});
    expect(await session.mutationStatus('once', mutationDigest(input))).toMatchObject({
      status: 'committed',
      mutationId: 'once',
    });
    await expect(session.mutationStatus('once', 'a'.repeat(64))).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(await session.mutationStatus('missing', 'a'.repeat(64))).toMatchObject({ status: 'not-found' });
  });
  it('retains a committed receipt after response loss at the commit point', async () => {
    let drop = true;
    const { session, authorization } = await fixture({
      onProgress: async ({ phase }) => {
        if (phase === 'source-replaced' && drop) {
          drop = false;
          throw new Error('response lost');
        }
      },
    });
    const input = commitInput(await snapshot(session), 'lost', authorization);
    await expect(session.commit(input)).rejects.toThrow('response lost');
    expect(await session.mutationStatus('lost', mutationDigest(input))).toMatchObject({
      status: 'committed',
    });
    await session.recover();
    expect((await session.commit(input)).kind).toBe('committed');
    expect((await snapshot(session)).deployment.meta.parentRevisionId).toBe(input.expected.sourceRevision);
  });
  it('creates immutable cumulative proposals and applies only the exact approved digest', async () => {
    const { session, trust, root, authorization } = await fixture();
    const base = await snapshot(session);
    const review = trust.authorizeRun(
      { ...root.identity(), projectId: 'project-1' },
      ['inspect', 'author'],
      'review-each-change',
    );
    const firstInput = commitInput(base, 'proposal-one', review, [
      { op: 'project', fields: { name: 'Proposed' } },
    ]);
    const first = await session.commit(firstInput);
    expect(first.kind).toBe('proposal');
    expect(first).toMatchObject({
      validation: { sourceHash: null, readiness: 'blocked' },
      approvalStatus: 'none',
    });
    if (first.kind !== 'proposal') throw new Error('Expected proposal');
    const nextInput = {
      ...commitInput(base, 'proposal-two', review, [
        { op: 'project', fields: { name: 'Proposed', exclusions: ['No hardware writes'] } },
      ]),
      supersedesProposalId: first.proposalId,
    };
    const next = await session.commit(nextInput);
    expect(next.kind).toBe('proposal');
    if (next.kind !== 'proposal') throw new Error('Expected proposal');
    expect((await snapshot(session)).sourceHash).toBe(base.sourceHash);
    expect(await session.mutationStatus('proposal-two', mutationDigest(nextInput))).toMatchObject({
      status: 'proposed',
      supersedes: first.proposalId,
    });
    await expect(session.commit({ ...nextInput, approvedPatchDigest: 'f'.repeat(64) })).rejects.toMatchObject(
      { code: 'PROPOSAL_DIGEST_MISMATCH' },
    );
    const applied = await session.commit({
      ...nextInput,
      authorization,
      approvedPatchDigest: next.patchDigest,
    });
    expect(applied.kind).toBe('committed');
    const final = await snapshot(session);
    expect(final.deployment.project).toMatchObject({ name: 'Proposed', exclusions: ['No hardware writes'] });
    expect((await session.proposalRead(first.proposalId)).digest).toBe(first.patchDigest);
  });
  it('supersedes a proposed add with a complete edited add without duplicating the record', async () => {
    const { session, trust, root, authorization } = await fixture();
    const base = await snapshot(session);
    const review = trust.authorizeRun(
      { ...root.identity(), projectId: 'project-1' },
      ['inspect', 'author'],
      'review-each-change',
    );
    const record = {
      id: 'need-1',
      title: 'Initial proposal',
      description: null,
      ownerId: null,
      sourceEvidenceIds: [],
      extensions: {},
      beneficiaryIds: [],
      outcome: null,
      workflowIds: [],
      requirementIds: [],
      disposition: null,
    };
    const first = await session.commit(
      commitInput(base, 'add-proposal', review, [{ op: 'add', collection: 'needs', record }]),
    );
    if (first.kind !== 'proposal') throw new Error('Expected proposal');
    const secondInput = {
      ...commitInput(base, 'edited-proposal', review, [
        { op: 'add', collection: 'needs', record: { ...record, title: 'Edited proposal' } },
      ]),
      supersedesProposalId: first.proposalId,
    };
    const second = await session.commit(secondInput);
    if (second.kind !== 'proposal') throw new Error('Expected proposal');
    await session.commit({ ...secondInput, authorization, approvedPatchDigest: second.patchDigest });
    expect((await snapshot(session)).deployment.needs).toHaveLength(1);
    expect((await snapshot(session)).deployment.needs[0]?.title).toBe('Edited proposal');
    expect((await session.proposalList()).find((p) => p.proposalId === first.proposalId)).toMatchObject({
      status: 'superseded',
      supersededBy: second.proposalId,
    });
  });
  it('treats a proposal candidate without its metadata as indeterminate rather than reusable', async () => {
    const { session, root } = await fixture();
    await root.mkdir('.robopomelo');
    await root.mkdir('.robopomelo/proposals');
    const handle = await root.createExclusive(`${proposalBase('partial')}.yaml`);
    await handle.write(await root.readFile('deployment.yaml'));
    await handle.close();
    expect(await session.mutationStatus('partial', 'a'.repeat(64))).toMatchObject({
      status: 'indeterminate',
    });
  });
});
