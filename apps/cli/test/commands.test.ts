import { reviewCommandCases } from './helpers/review-command-cases.js';
import { afterEach, expect, it } from 'vitest';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './helpers/commands.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()));
});
async function host(example = false) {
  const f = await fixture(example);
  cleanup.push(f.close);
  return f;
}
reviewCommandCases(host);
it('saves a blocked draft successfully and reports validate blockers as exit three', async () => {
  const f = await host(),
    patch = await f.patch();
  const saved = await f.run(['patch', 'apply', '-', '--authorize', 'author', '--json'], patch);
  expect(saved.data).toMatchObject({ status: 'applied', readiness: 'blocked' });
  expect(saved.exitCode ?? 0).toBe(0);
  const validation = await f.run(['validate', '--json']);
  expect(validation).toMatchObject({ exitCode: 3, ok: false, data: { readiness: 'blocked' } });
  expect(validation.snapshot?.sourceHash).toBe(saved.snapshot?.sourceHash);
});
it('checks and diffs without writing source or history, and keeps capability declarations intact', async () => {
  const f = await host(),
    patch = { ...(await f.patch()), capabilityId: 'frame-robot-deployment' },
    before = await readFile(join(f.path, 'deployment.yaml')),
    history = await readdir(join(f.path, '.robopomelo/history'));
  expect((await f.run(['patch', 'check', '-', '--authorize', 'author'], patch)).data).toMatchObject({
    status: 'valid',
    validation: { readiness: 'blocked' },
  });
  expect((await f.run(['patch', 'diff', '-', '--authorize', 'author'], patch)).data).toHaveProperty('diff');
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(before);
  expect(await readdir(join(f.path, '.robopomelo/history'))).toEqual(history);
  await expect(
    f.run(['patch', 'apply', '-', '--authorize', 'author'], {
      ...patch,
      capabilityId: 'define-deployment-kpis',
    }),
  ).rejects.toMatchObject({ code: 'FIELD_NOT_ALLOWED' });
});
it('distinguishes proposed, applied and already-applied mutation receipts', async () => {
  const f = await host();
  await f.project.grant(['author'], 'review-each-change', true);
  const patch = await f.patch();
  const proposed = await f.run(['patch', 'apply', '-'], patch);
  expect(proposed.data).toMatchObject({ status: 'proposed', readiness: 'blocked' });
  const p = proposed.data as { proposalId: string; patchDigest: string };
  const applied = await f.run([
    'patch',
    'apply',
    '--proposal',
    p.proposalId,
    '--digest',
    p.patchDigest,
    '--base-revision',
    patch.baseRevision,
    '--base-hash',
    patch.baseHash,
  ]);
  expect(applied.data).toMatchObject({ status: 'applied' });
  const repeated = await f.run(['patch', 'apply', '-'], patch);
  expect(repeated.data).toMatchObject({ status: 'already-applied' });
  const receipt = await f.run([
    'show',
    '--change',
    patch.id,
    '--digest',
    (applied.data as { receiptDigest: string }).receiptDigest,
  ]);
  expect(receipt.data).toMatchObject({ status: 'committed' });
});
it('rejects missing author authority even with --yes and does not mutate input', async () => {
  const f = await host(),
    patch = await f.patch(),
    before = await readFile(join(f.path, 'deployment.yaml'));
  await expect(f.run(['patch', 'apply', '-', '--yes', '--json'], patch)).rejects.toMatchObject({
    code: 'SCOPE_DENIED',
  });
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(before);
});
it('returns blocked validation with parser locations for malformed YAML and preserves source bytes', async () => {
  const f = await host();
  const bytes = 'project:\n  id: one\n  id: two\n';
  await writeFile(join(f.path, 'deployment.yaml'), bytes);
  const result = await f.run(['validate', '--json']);
  expect(result).toMatchObject({ exitCode: 3, ok: false, data: { readiness: 'blocked' } });
  expect((result.data as { problems: unknown[] }).problems.length).toBeGreaterThan(0);
  expect(await readFile(join(f.path, 'deployment.yaml'), 'utf8')).toBe(bytes);
});
it('shows stable records and traceability and rejects mutually exclusive show modes', async () => {
  const f = await host(true);
  expect((await f.run(['show', '--id', 'need-transfer'])).data).toHaveProperty('record.id', 'need-transfer');
  expect((await f.run(['show', '--traceability'])).data).toHaveProperty('traceability');
  await expect(f.run(['show', '--id', 'need-transfer', '--traceability'])).rejects.toMatchObject({
    code: 'INVALID_ARGUMENTS',
  });
});
const actorJson = JSON.stringify({ kind: 'human', name: 'Engineer', source: 'CLI review' });
it('lists, shows, restores and reconciles actual recorded history', async () => {
  const f = await host(),
    original = await f.project.snapshot();
  const changed = await f.run(['patch', 'apply', '-', '--authorize', 'author'], await f.patch());
  const s = changed.snapshot!;
  expect((await f.run(['history', 'list'])).data).toHaveProperty('revisions');
  expect((await f.run(['history', 'show', original.sourceRevision])).snapshot?.sourceHash).toBe(
    original.sourceHash,
  );
  const restored = await f.run([
    'history',
    'restore',
    original.sourceRevision,
    '--base-revision',
    s.sourceRevision,
    '--base-hash',
    s.sourceHash,
    '--actor',
    actorJson,
    '--reason',
    'Restore the prior draft',
    '--authorize',
    'author',
  ]);
  expect(restored.data).toMatchObject({ status: 'applied' });
  expect(restored.snapshot?.deployment.project.scope).toBeNull();
  const bytes = await readFile(join(f.path, 'deployment.yaml'), 'utf8');
  await writeFile(
    join(f.path, 'deployment.yaml'),
    bytes.replace('name: Planning', 'name: External planning'),
  );
  const external = await f.project.snapshot();
  const reconciled = await f.run([
    'history',
    'reconcile',
    '--base-hash',
    external.sourceHash,
    '--actor',
    actorJson,
    '--change',
    'cli-external-change',
    '--authorize',
    'author',
  ]);
  expect(reconciled.data).toMatchObject({ status: 'applied', changeId: 'cli-external-change' });
  expect((await f.run(['history', 'recover'])).data).toHaveProperty('results');
});
it('copies an explicitly selected evidence file, checks it and retains bytes after reference removal', async () => {
  const f = await host();
  const path = join(f.root, 'support.txt');
  await writeFile(path, 'Measured observations');
  const s = await f.project.snapshot();
  const added = await f.run([
    'evidence',
    'add',
    path,
    '--purpose',
    'planning',
    '--title',
    'Site observation',
    '--provenance',
    'Supplied notes',
    '--base-revision',
    s.sourceRevision,
    '--base-hash',
    s.sourceHash,
    '--actor',
    actorJson,
    '--authorize',
    'author,evidence',
  ]);
  expect(added.data).toMatchObject({ status: 'applied' });
  const next = added.snapshot!,
    e = next.deployment.evidence[0]!;
  expect(e.location.kind).toBe('attachment');
  expect((await f.run(['evidence', 'list'])).data).toHaveProperty('evidence');
  expect((await f.run(['evidence', 'check'])).data).toHaveProperty('observations');
  const removed = await f.run([
    'evidence',
    'remove',
    e.id,
    '--base-revision',
    next.sourceRevision,
    '--base-hash',
    next.sourceHash,
    '--actor',
    actorJson,
    '--authorize',
    'author,evidence',
  ]);
  expect(removed.snapshot?.deployment.evidence).toEqual([]);
  expect(await readFile(join(f.path, (e.location as { path: string }).path), 'utf8')).toBe(
    'Measured observations',
  );
});
it('records an external evidence reference without fetching its URL', async () => {
  const f = await host(),
    s = await f.project.snapshot();
  const result = await f.run([
    'evidence',
    'add',
    '--reference',
    'https://example.invalid/private-source',
    '--purpose',
    'planning',
    '--title',
    'External planning source',
    '--provenance',
    'Supplied reference',
    '--base-revision',
    s.sourceRevision,
    '--base-hash',
    s.sourceHash,
    '--actor',
    actorJson,
    '--authorize',
    'author',
  ]);
  expect(result.snapshot?.deployment.evidence[0]?.location).toEqual({
    kind: 'external',
    uri: 'https://example.invalid/private-source',
  });
});
it('exports exact blocked source bytes with explicit evidence omission and confined output', async () => {
  const f = await host(),
    source = await readFile(join(f.path, 'deployment.yaml'));
  await expect(f.run(['export', '--authorize', 'export'])).rejects.toMatchObject({
    code: 'INVALID_ARGUMENTS',
  });
  const result = await f.run([
    'export',
    '--format',
    'files',
    '--no-evidence',
    '--output',
    'review-package',
    '--authorize',
    'export',
  ]);
  expect(result.data).toMatchObject({ path: 'exports/review-package', format: 'files' });
  expect(await readFile(join(f.path, 'exports/review-package/deployment.yaml'))).toEqual(source);
  expect(await readFile(join(f.path, 'exports/review-package/review.html'), 'utf8')).toContain(
    'Specification blocked',
  );
  await expect(
    f.run(['export', '--no-evidence', '--output', '../outside.zip', '--authorize', 'export']),
  ).rejects.toThrow();
});
it('grants and revokes remembered trust without --yes supplying authority', async () => {
  const f = await host();
  await expect(f.run(['trust', 'grant', '--scopes', 'author', '--yes'])).rejects.toMatchObject({
    code: 'SCOPE_REQUIRED',
  });
  await f.run([
    'trust',
    'grant',
    '--scopes',
    'author,evidence',
    '--mode',
    'autonomous',
    '--remember',
    '--authorize',
    'manage-settings',
  ]);
  const trust = await f.run(['trust', 'show']);
  expect(trust.data).toMatchObject({ effectiveScopes: expect.arrayContaining(['author', 'evidence']) });
  await f.run(['trust', 'revoke', '--authorize', 'manage-settings']);
  expect((await f.run(['trust', 'show'])).data).toMatchObject({ effectiveScopes: ['inspect'] });
  await f.run(['trust', 'forget', '--authorize', 'manage-settings']);
});
it('reports noop migration and refuses unsupported migrations without rewriting source', async () => {
  const f = await host(),
    bytes = await readFile(join(f.path, 'deployment.yaml'));
  expect((await f.run(['migrate', '--target', '1.0.0'])).data).toMatchObject({ kind: 'noop' });
  await expect(f.run(['migrate', '--target', '2.0.0'])).rejects.toMatchObject({
    code: 'UNSUPPORTED_MIGRATION',
  });
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(bytes);
});
it('provides registry capability data and read-only doctor diagnostics', async () => {
  const f = await host(),
    before = await readFile(join(f.path, 'deployment.yaml'));
  expect((await f.run(['capabilities'])).data).toHaveProperty('capabilities');
  expect((await f.run(['doctor'])).data).toHaveProperty('toolVersion', '1.0.0');
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(before);
});

it('configures machine update policy explicitly without persisting a global offline flag', async () => {
  const f = await host();
  await expect(f.run(['update', 'configure', '--mode', 'off', '--yes'])).rejects.toMatchObject({
    code: 'SCOPE_REQUIRED',
  });
  await f.run(['update', 'configure', '--mode', 'notify', '--offline', '--authorize', 'manage-settings']);
  expect((await f.project.settings.read()).updates).toMatchObject({ mode: 'notify', offline: false });
  await f.project.settings.update((d) => {
    d.updates.offline = true;
  });
  await f.run(['update', 'configure', '--online', '--pin', '1.0.0-rc.1', '--authorize', 'manage-settings']);
  expect((await f.project.settings.read()).updates).toMatchObject({
    offline: false,
    pinnedVersion: '1.0.0-rc.1',
  });
});
import { digestValue } from '../../../packages/project-fs/src/transactions/digest.js';
it('retires an explicitly identified uncommitted attempt while preserving the exact old source', async () => {
  const f = await host();
  await f.project.grant(['author'], 'autonomous', false);
  const patch = await f.patch(),
    before = await readFile(join(f.path, 'deployment.yaml'));
  f.project.current!.session!.options.onProgress = ({ phase }) => {
    if (phase === 'journal-flushed') throw new Error('Synthetic interruption before source commit');
  };
  await expect(f.project.apply(patch)).rejects.toThrow('Synthetic interruption');
  const recovery = await f.run(['history', 'recover']);
  expect(recovery).toMatchObject({ exitCode: 6, data: { status: 'action-required' } });
  const digest = digestValue({ kind: 'patch', patch });
  const retired = await f.run([
    'history',
    'retire',
    patch.id,
    '--digest',
    digest,
    '--base-revision',
    patch.baseRevision,
    '--base-hash',
    patch.baseHash,
    '--actor',
    actorJson,
    '--reason',
    'Abandon this unchanged attempt',
    '--authorize',
    'author',
  ]);
  expect(retired.data).toHaveProperty('mutationId', patch.id);
  expect((await f.run(['show', '--change', patch.id, '--digest', digest])).data).toMatchObject({
    status: 'retired',
  });
  expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(before);
});
it('requires explicit apply metadata for noop migration without pretending a schema change occurred', async () => {
  const f = await host(),
    s = await f.project.snapshot();
  const result = await f.run([
    'migrate',
    '--target',
    '1.0.0',
    '--apply',
    '--base-revision',
    s.sourceRevision,
    '--base-hash',
    s.sourceHash,
    '--actor',
    actorJson,
    '--authorize',
    'author',
  ]);
  expect(result.data).toMatchObject({ kind: 'noop', from: '1.0.0', to: '1.0.0' });
  expect(result.snapshot?.sourceHash).toBe(s.sourceHash);
});
