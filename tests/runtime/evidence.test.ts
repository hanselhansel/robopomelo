import { afterEach, describe, expect, it } from 'vitest';
import { writeFile, readFile, truncate, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionFixture, snapshot, actor } from './helpers/session-fixture.js';
import { EvidenceService } from '../../packages/project-fs/src/evidence/service.js';
import { FileSelection } from '../../packages/project-fs/src/evidence/selection.js';
import { observeEvidence } from '../../packages/project-fs/src/evidence/observe.js';
import { byteHash } from '../../packages/project-fs/src/transactions/digest.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function fixture() {
  const f = await sessionFixture();
  cleanup.push(f.close);
  return { ...f, evidence: new EvidenceService(f.session) };
}
const chunks = async function* (bytes: Uint8Array) {
  yield bytes.subarray(0, 2);
  yield bytes.subarray(2);
};
async function input(f: Awaited<ReturnType<typeof fixture>>, id: string) {
  const s = await snapshot(f.session);
  return {
    expected: { sourceRevision: s.sourceRevision, sourceHash: s.sourceHash },
    mutationId: id,
    authorization: f.authorization,
    actor,
    metadata: { title: 'Selected source', purpose: 'planning' as const, provenance: null, relatedIds: [] },
  };
}
describe('explicit evidence handles and staged uploads', () => {
  it('copies an explicitly selected file through a generated attachment and verifies it', async () => {
    const f = await fixture();
    const path = join(f.base, 'selected.txt');
    await writeFile(path, 'supporting evidence');
    const selection = await FileSelection.open(path);
    cleanup.push(() => selection.close());
    expect(selection).not.toHaveProperty('path');
    const result = await f.evidence.addFile(selection, await input(f, 'file-add'));
    expect(result.kind).toBe('committed');
    const s = await snapshot(f.session);
    const record = s.deployment.evidence[0]!;
    expect(record.location.kind).toBe('attachment');
    if (record.location.kind !== 'attachment') throw new Error('Expected attachment');
    expect(await f.root.readFile(record.location.path)).toEqual(Buffer.from('supporting evidence'));
    expect(await observeEvidence(f.root, s.deployment, () => '2026-09-05T02:00:00.000Z')).toMatchObject([
      { evidenceId: record.id, state: 'present', checkedAt: '2026-09-05T02:00:00.000Z' },
    ]);
  });
  it('binds prepared metadata, supplied bytes and response-loss retries to one mutation', async () => {
    const f = await fixture(),
      bytes = Buffer.from('selected payload');
    const request = await input(f, 'upload');
    const prepared = await f.evidence.prepare({
      ...request,
      selected: { name: 'payload.bin', size: bytes.length, sha256: byteHash(bytes) },
    });
    const first = await f.evidence.accept(prepared.uploadId, chunks(bytes));
    const second = await f.evidence.accept(prepared.uploadId, chunks(bytes));
    expect(first).toMatchObject({ kind: 'committed', alreadyApplied: false });
    expect(second).toEqual({ ...first, alreadyApplied: true });
    expect((await snapshot(f.session)).deployment.evidence).toHaveLength(1);
    expect(await f.session.mutationStatus(request.mutationId, prepared.receiptDigest)).toMatchObject({
      status: 'committed',
    });
  });
  it('rejects mismatched and interrupted streams without modifying source', async () => {
    const f = await fixture(),
      bytes = Buffer.from('correct');
    const before = await snapshot(f.session);
    const prepared = await f.evidence.prepare({
      ...(await input(f, 'mismatch')),
      selected: { name: 'data', size: bytes.length, sha256: byteHash(bytes) },
    });
    await expect(f.evidence.accept(prepared.uploadId, chunks(Buffer.from('wrong!!')))).rejects.toMatchObject({
      code: 'EVIDENCE_MISMATCH',
    });
    const interrupted = await f.evidence.prepare({
      ...(await input(f, 'interrupted')),
      selected: { name: 'data', size: bytes.length, sha256: byteHash(bytes) },
    });
    await expect(
      f.evidence.accept(
        interrupted.uploadId,
        (async function* () {
          yield bytes.subarray(0, 2);
          throw new Error('transfer aborted');
        })(),
      ),
    ).rejects.toThrow('transfer aborted');
    expect((await snapshot(f.session)).sourceHash).toBe(before.sourceHash);
  });
  it('rejects oversized selection, changed selected files and symlinks', async () => {
    const f = await fixture();
    const path = join(f.base, 'source');
    await writeFile(path, 'before');
    const selection = await FileSelection.open(path);
    cleanup.push(() => selection.close());
    await writeFile(path, 'after!');
    await expect(selection.inspect()).rejects.toMatchObject({ code: 'SELECTION_CHANGED' });
    await truncate(path, 256 * 1024 * 1024 + 1);
    await expect(FileSelection.open(path)).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    const target = join(f.base, 'target');
    await writeFile(target, 'target');
    const link = join(f.base, 'link');
    await symlink(target, link, 'file');
    await expect(FileSelection.open(link)).rejects.toThrow();
  });
  it('requires evidence authority and treats external/future locations as declarations', async () => {
    const f = await fixture();
    const author = f.trust.authorizeRun(
      { ...f.root.identity(), projectId: 'project-1' },
      ['inspect', 'author'],
      'autonomous',
    );
    await expect(
      f.evidence.prepare({
        ...(await input(f, 'unauthorized')),
        authorization: author,
        selected: { name: 'a', size: 1, sha256: byteHash('a') },
      }),
    ).rejects.toThrow();
    await f.evidence.reference(await input(f, 'external'), {
      kind: 'external',
      uri: 'https://invalid.example.test/never-fetch',
    });
    await f.evidence.reference(await input(f, 'future'), {
      kind: 'future',
      description: 'A future acceptance result',
    });
    expect(await f.evidence.observe()).toMatchObject([
      { state: 'external', checkedAt: null },
      { state: 'future', checkedAt: null },
    ]);
  });
  it('removes only the active reference while retaining attachment bytes and history', async () => {
    const f = await fixture();
    const selected = join(f.base, 'source.txt');
    await writeFile(selected, 'retained');
    const selection = await FileSelection.open(selected);
    cleanup.push(() => selection.close());
    await f.evidence.addFile(selection, await input(f, 'add'));
    const withEvidence = await snapshot(f.session);
    const e = withEvidence.deployment.evidence[0]!;
    if (e.location.kind !== 'attachment') throw new Error('Expected attachment');
    await f.evidence.remove(e.id, await input(f, 'remove'));
    expect((await snapshot(f.session)).deployment.evidence).toEqual([]);
    expect(await f.root.readFile(e.location.path)).toEqual(Buffer.from('retained'));
    expect(
      (await f.session.historyRead(withEvidence.sourceRevision)).snapshot.deployment.evidence,
    ).toHaveLength(1);
  });
});
