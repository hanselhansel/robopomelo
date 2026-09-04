import { afterEach, describe, expect, it } from 'vitest';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { sessionFixture, snapshot, commitInput, actor } from './helpers/session-fixture.js';
import { historyBase } from '../../packages/project-fs/src/transactions/io.js';
import { writeInitialHistory } from '../../packages/project-fs/src/history.js';
import type { Approval } from '@robopomelo/spec';
import { byteHash, digestValue } from '../../packages/project-fs/src/transactions/digest.js';
import { jsonRead } from '../../packages/project-fs/src/transactions/io.js';
import { ProjectSession } from '../../packages/project-fs/src/session.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const f = await sessionFixture();
  cleanup.push(f.close);
  return f;
}
async function reviewedFixture() {
  const f = await fixture();
  const source = parse(await readFile(join(f.path, 'deployment.yaml'), 'utf8'));
  source.stakeholders = [
    {
      id: 'person',
      title: actor.name,
      description: null,
      ownerId: null,
      sourceEvidenceIds: [],
      extensions: {},
      role: null,
      responsibilities: [],
    },
  ];
  source.project.approverId = { state: 'provided', value: 'person' };
  await writeFile(join(f.path, 'deployment.yaml'), stringify(source));
  const before = await snapshot(f.session);
  const record: Approval = {
    id: 'decision',
    reviewerId: 'person',
    reviewerName: actor.name,
    recorder: actor,
    reviewerRole: 'Reviewer',
    decision: 'rejected',
    decidedAt: '2026-09-05T01:00:00.000Z',
    source: 'local review',
    sourceRevision: before.sourceRevision,
    sourceHash: before.sourceHash,
    planningHash: before.planningHash,
    ruleSetVersion: before.validation.ruleSetVersion,
    acknowledgmentIds: [],
    waiverIds: [],
    evidenceIds: [],
  };
  const input = commitInput(before, 'record-review', f.authorization);
  if (input.mutation.kind !== 'patch') throw new Error('Expected patch');
  const { operations: _operations, ...command } = input.mutation.patch;
  await f.session.commit({
    ...input,
    mutation: { kind: 'review', review: { ...command, input: { action: 'approve', record } } },
  });
  return { ...f, before };
}
describe('immutable history and explicit external reconciliation', () => {
  it('uses the known history head for protected reconciliation after an external revision edit and reopen', async () => {
    const f = await fixture();
    const source = parse(await readFile(join(f.path, 'deployment.yaml'), 'utf8'));
    source.risks = [
      {
        id: 'risk-1',
        title: 'Risk',
        description: null,
        ownerId: null,
        sourceEvidenceIds: [],
        extensions: {},
        statement: null,
        nextAction: null,
        status: 'open',
        resolution: null,
        relatedIds: [],
        requiredBeforeReview: true,
        consequence: null,
        mitigation: null,
        testIds: [],
      },
    ];
    const before = Buffer.from(stringify(source));
    await writeFile(join(f.path, 'deployment.yaml'), before);
    await writeInitialHistory(f.root, before, { projectId: 'project-1' });
    source.risks = [];
    source.meta.revisionId = 'externally-edited-revision';
    await writeFile(join(f.path, 'deployment.yaml'), stringify(source));
    const reopened = new ProjectSession(f.session.options);
    const current = await snapshot(reopened);
    const author = f.trust.authorizeRun(
      { ...f.root.identity(), projectId: 'project-1' },
      ['inspect', 'author'],
      'autonomous',
    );
    await expect(reopened.reconcileExternal(current.sourceHash, actor, author)).rejects.toMatchObject({
      code: 'SCOPE_REQUIRED',
    });
  });
  it.each([
    {
      diff: [{ collection: { invalid: true }, id: 'project-1', field: 'name', before: null, after: 'fake' }],
    },
    { actor: { kind: 'human', name: { invalid: true } } },
    { executable: 'unrecognized metadata field' },
  ])('rejects malformed nested metadata despite a matching checksum', async (fields) => {
    const f = await fixture();
    const initial = await snapshot(f.session);
    await writeInitialHistory(f.root, await readFile(join(f.path, 'deployment.yaml')), {
      projectId: 'project-1',
      actor,
    });
    const path = `${historyBase(initial.sourceRevision)}.json`;
    const value = { ...((await jsonRead(f.root, path)) as object), ...fields };
    await writeFile(join(f.path, path), JSON.stringify({ value, checksum: digestValue(value) }));
    await expect(f.session.historyRead(initial.sourceRevision)).rejects.toMatchObject({
      code: 'HISTORY_TAMPERED',
    });
  });
  it('records initial source history without inventing a transaction or receipt', async () => {
    const f = await fixture();
    const initial = await snapshot(f.session);
    await writeInitialHistory(f.root, await readFile(join(f.path, 'deployment.yaml')), {
      projectId: 'project-1',
      actor,
    });
    expect((await f.session.historyRead(initial.sourceRevision)).snapshot.sourceHash).toBe(
      initial.sourceHash,
    );
    await expect(f.root.stat('.robopomelo/recovery')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await f.session.mutationStatus('initial', 'a'.repeat(64))).toMatchObject({ status: 'not-found' });
  });
  it('restores authoring content as a new revision while retaining current review decisions', async () => {
    const { session, authorization } = await fixture();
    const initial = await snapshot(session);
    await session.commit(commitInput(initial, 'change', authorization));
    const changed = await snapshot(session);
    const restored = await session.restore(initial.sourceRevision, {
      expected: { sourceRevision: changed.sourceRevision, sourceHash: changed.sourceHash },
      idempotencyKey: 'restore',
      authorization,
      actor,
      purpose: 'Restore authored scope',
    });
    expect(restored.kind).toBe('committed');
    const final = await snapshot(session);
    expect(final.deployment.project.name).toBe('Original');
    expect(final.sourceRevision).not.toBe(initial.sourceRevision);
    expect(final.deployment.review).toEqual(changed.deployment.review);
  });
  it('restores root extensions and preserves exact external source as a recovery snapshot', async () => {
    const { session, path, authorization } = await fixture();
    const initial = await snapshot(session);
    await session.commit(commitInput(initial, 'first', authorization));
    const external = parse(await readFile(join(path, 'deployment.yaml'), 'utf8'));
    external.extensions.acme.code = '002';
    await writeFile(join(path, 'deployment.yaml'), stringify(external));
    const opened = await session.open();
    expect(opened).toMatchObject({ kind: 'readable', externalEdit: true });
    if (opened.kind !== 'readable') throw new Error('Expected readable external source');
    await session.reconcileExternal(opened.snapshot.sourceHash, actor, authorization);
    const now = await snapshot(session);
    expect(now.deployment.extensions).toEqual({ acme: { code: '002', flag: false } });
    await session.restore(initial.sourceRevision, {
      expected: { sourceRevision: now.sourceRevision, sourceHash: now.sourceHash },
      idempotencyKey: 'restore-extensions',
      authorization,
      actor,
      purpose: 'Restore extension values',
    });
    expect((await snapshot(session)).deployment.extensions).toEqual(initial.deployment.extensions);
  });
  it('does not lose the known prior protected state when external source was opened before reconciliation', async () => {
    const { session, path, root, trust } = await fixture();
    const original = parse(await readFile(join(path, 'deployment.yaml'), 'utf8'));
    original.risks = [
      {
        id: 'risk-1',
        title: 'Risk',
        description: null,
        ownerId: null,
        sourceEvidenceIds: [],
        extensions: {},
        statement: null,
        nextAction: null,
        status: 'open',
        resolution: null,
        relatedIds: [],
        requiredBeforeReview: true,
        consequence: null,
        mitigation: null,
        testIds: [],
      },
    ];
    await writeFile(join(path, 'deployment.yaml'), stringify(original));
    await snapshot(session);
    original.risks = [];
    await writeFile(join(path, 'deployment.yaml'), stringify(original));
    const external = await snapshot(session);
    const author = trust.authorizeRun(
      { ...root.identity(), projectId: 'project-1' },
      ['inspect', 'author'],
      'autonomous',
    );
    await expect(session.reconcileExternal(external.sourceHash, actor, author)).rejects.toMatchObject({
      code: 'SCOPE_REQUIRED',
    });
    const agentGrant = trust.authorizeRun(
      { ...root.identity(), projectId: 'project-1' },
      ['inspect', 'author', 'record-decisions'],
      'autonomous',
    );
    await expect(
      session.reconcileExternal(external.sourceHash, { kind: 'agent', name: 'Assistant' }, agentGrant),
    ).rejects.toMatchObject({ code: 'INVALID_PROVENANCE' });
  });
  it('refuses history tampering before restoration', async () => {
    const { session, root, authorization } = await fixture();
    const initial = await snapshot(session);
    await session.commit(commitInput(initial, 'first', authorization));
    const h = await root.createExclusive('tampered');
    await h.write(Buffer.from('project: bogus'));
    await h.close();
    await root.renameReplace('tampered', `${historyBase(initial.sourceRevision)}.yaml`);
    await expect(session.historyRead(initial.sourceRevision)).rejects.toMatchObject({
      code: 'HISTORY_TAMPERED',
    });
  });
  it('retains a revocation and current review ledger while restoring earlier authoring state', async () => {
    const f = await reviewedFixture();
    const reviewed = await snapshot(f.session);
    expect(reviewed.approvalStatus).toBe('rejected');
    const input = commitInput(reviewed, 'revoke-review', f.authorization);
    if (input.mutation.kind !== 'patch') throw new Error('Expected patch');
    const { operations: _operations, ...command } = input.mutation.patch;
    await f.session.commit({
      ...input,
      mutation: {
        kind: 'review',
        review: {
          ...command,
          input: {
            action: 'revoke',
            record: {
              id: 'revocation',
              approvalId: 'decision',
              actor,
              reason: 'Reevaluate assumptions',
              source: 'local review',
              recordedAt: '2026-09-05T01:00:00.000Z',
            },
          },
        },
      },
    });
    const revoked = await snapshot(f.session);
    await f.session.restore(f.before.sourceRevision, {
      expected: { sourceRevision: revoked.sourceRevision, sourceHash: revoked.sourceHash },
      idempotencyKey: 'restore-before-review',
      authorization: f.authorization,
      actor,
      purpose: 'Restore earlier authoring',
    });
    const after = await snapshot(f.session);
    expect(after.approvalStatus).toBe('revoked');
    expect(after.deployment.review.revocations).toHaveLength(1);
    expect(after.deployment.review.approvals).toHaveLength(1);
  });
  it('carries core-observed invalidity across read-only X to Y to X into the next authorized mutation', async () => {
    const f = await reviewedFixture();
    const original = await readFile(join(f.path, 'deployment.yaml'));
    const changed = parse(original.toString());
    changed.project.name = 'Temporarily different';
    await writeFile(join(f.path, 'deployment.yaml'), stringify(changed));
    expect((await snapshot(f.session)).approvalStatus).toBe('stale');
    await writeFile(join(f.path, 'deployment.yaml'), original);
    const returned = await snapshot(f.session);
    expect(returned.approvalStatus).toBe('rejected');
    await f.session.commit(commitInput(returned, 'record-observed-change', f.authorization, []));
    const final = await snapshot(f.session);
    expect(final.deployment.review.invalidations).toMatchObject([
      { approvalId: 'decision', reason: 'planning-content-changed' },
    ]);
    expect(final.approvalStatus).toBe('stale');
  });
  it('refuses to restore a historical attachment whose bytes are no longer present', async () => {
    const f = await fixture();
    const initial = await snapshot(f.session);
    for (const directory of ['.robopomelo', '.robopomelo/recovery', '.robopomelo/recovery/uploads'])
      await f.root.mkdir(directory);
    const bytes = Buffer.from('evidence');
    const stagedPath = '.robopomelo/recovery/uploads/local.bin',
      finalPath = 'evidence/generated.bin',
      sha256 = byteHash(bytes);
    const handle = await f.root.createExclusive(stagedPath);
    await handle.write(bytes);
    await handle.close();
    const record = {
      id: 'evidence-1',
      title: 'Source',
      description: null,
      ownerId: null,
      sourceEvidenceIds: [],
      extensions: {},
      purpose: 'planning',
      location: { kind: 'attachment', path: finalPath, sha256, size: bytes.length },
      required: false,
      relatedIds: [],
      provenance: null,
    };
    await f.session.commit({
      ...commitInput(initial, 'add-evidence', f.authorization, [
        { op: 'add', collection: 'evidence', record },
      ]),
      stagedEvidence: [{ evidenceId: 'evidence-1', stagedPath, finalPath, sha256, size: bytes.length }],
    });
    const withEvidence = await snapshot(f.session);
    await f.session.commit(
      commitInput(withEvidence, 'remove-reference', f.authorization, [
        { op: 'remove', collection: 'evidence', id: 'evidence-1' },
      ]),
    );
    await unlink(join(f.path, finalPath));
    const current = await snapshot(f.session);
    await expect(
      f.session.restore(withEvidence.sourceRevision, {
        expected: { sourceRevision: current.sourceRevision, sourceHash: current.sourceHash },
        idempotencyKey: 'restore-missing',
        authorization: f.authorization,
        actor,
        purpose: 'Restore earlier evidence reference',
      }),
    ).rejects.toMatchObject({ code: 'MISSING_HISTORY_EVIDENCE' });
  });
});
