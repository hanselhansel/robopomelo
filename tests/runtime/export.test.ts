import { fixtureEntry } from './helpers/entry-path.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { generateArtifacts } from '@robopomelo/artifacts';
import { sessionFixture, snapshot, actor } from './helpers/session-fixture.js';
import { ExportService } from '../../packages/project-fs/src/export/service.js';
import { EvidenceService } from '../../packages/project-fs/src/evidence/service.js';
import { FileSelection } from '../../packages/project-fs/src/evidence/selection.js';
const cleanup: (() => Promise<void>)[] = [];
let executable: string;
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rp-export-worker-'));
  executable = join(directory, 'worker.cjs');
  await build({
    entryPoints: [fixtureEntry('./helpers/export-child.ts', import.meta.url)],
    outfile: executable,
    bundle: true,
    platform: 'node',
    format: 'cjs',
  });
  return async () => {
    await rm(directory, { recursive: true, force: true });
  };
});
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function fixture(withEvidence = false) {
  const f = await sessionFixture();
  cleanup.push(f.close);
  const authorization = f.trust.authorizeRun(
    { ...f.root.identity(), projectId: 'project-1' },
    ['inspect', 'export'],
    'autonomous',
  );
  if (withEvidence) {
    const source = join(f.base, 'selected.txt');
    await writeFile(source, 'exported evidence');
    const file = await FileSelection.open(source);
    cleanup.push(() => file.close());
    const s = await snapshot(f.session);
    await new EvidenceService(f.session).addFile(file, {
      expected: { sourceRevision: s.sourceRevision, sourceHash: s.sourceHash },
      mutationId: 'attachment',
      authorization: f.authorization,
      actor,
      metadata: { title: 'Evidence', purpose: 'planning', provenance: null, relatedIds: [] },
    });
  }
  const current = await snapshot(f.session);
  const plan = generateArtifacts({
    source: await readFile(join(f.path, 'deployment.yaml'), 'utf8'),
    snapshot: current,
    selectedEvidenceIds: withEvidence ? current.deployment.evidence.map((e) => e.id) : [],
  });
  return {
    ...f,
    authorization,
    plan,
    expected: { sourceRevision: current.sourceRevision, sourceHash: current.sourceHash },
    exports: new ExportService(f.session),
  };
}
function zipEntries(bytes: Buffer) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('Missing ZIP directory');
  let at = bytes.readUInt32LE(end + 16);
  const count = bytes.readUInt16LE(end + 10),
    result = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(bytes.readUInt32LE(at)).toBe(0x02014b50);
    expect(bytes.readUInt16LE(at + 10)).toBe(0);
    expect(bytes.readUInt16LE(at + 12)).toBe(0);
    expect(bytes.readUInt16LE(at + 14)).toBe(33);
    const size = bytes.readUInt32LE(at + 24),
      length = bytes.readUInt16LE(at + 28),
      extra = bytes.readUInt16LE(at + 30),
      comment = bytes.readUInt16LE(at + 32),
      local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + length).toString();
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    result.set(name, bytes.subarray(start, start + size));
    at += 46 + length + extra + comment;
  }
  return result;
}
describe('frozen confined export persistence', () => {
  it('produces identical ZIP bytes in actual processes with different time zones', async () => {
    const f = await fixture(true),
      run = promisify(execFile);
    await run(process.execPath, [executable, f.path, 'utc.zip'], { env: { ...process.env, TZ: 'UTC' } });
    await run(process.execPath, [executable, f.path, 'pacific.zip'], {
      env: { ...process.env, TZ: 'America/Los_Angeles' },
    });
    expect(await f.root.readFile('exports/utc.zip')).toEqual(await f.root.readFile('exports/pacific.zip'));
  });
  it('previews without output writes and creates files containing exact source and selected evidence', async () => {
    const f = await fixture(true);
    const preview = await f.exports.preview(f.plan, f.expected, f.authorization);
    await expect(f.root.stat('exports')).rejects.toMatchObject({ code: 'ENOENT' });
    const result = await f.exports.persist(preview.previewId, {
      format: 'files',
      name: 'review-files',
      authorization: f.authorization,
    });
    expect(result.path).toBe('exports/review-files');
    expect(await f.root.readFile(`${result.path}/deployment.yaml`)).toEqual(
      await f.root.readFile('deployment.yaml'),
    );
    for (const attachment of f.plan.attachments)
      expect(await f.root.readFile(`${result.path}/${attachment.path}`)).toEqual(
        await f.root.readFile(attachment.sourcePath),
      );
    await expect(
      f.exports.persist(preview.previewId, {
        format: 'files',
        name: 'review-files',
        authorization: f.authorization,
      }),
    ).rejects.toThrow();
  });
  it('writes deterministic stored ZIP entries and never includes private ancillary project files', async () => {
    const f = await fixture(true);
    const preview = await f.exports.preview(f.plan, f.expected, f.authorization);
    const first = await f.exports.persist(preview.previewId, {
      format: 'zip',
      name: 'first.zip',
      authorization: f.authorization,
    });
    const second = await f.exports.persist(preview.previewId, {
      format: 'zip',
      name: 'second.zip',
      authorization: f.authorization,
    });
    const bytes = await f.root.readFile(first.path);
    expect(await f.root.readFile(second.path)).toEqual(bytes);
    const entries = zipEntries(bytes);
    expect(entries.get('deployment.yaml')).toEqual(await f.root.readFile('deployment.yaml'));
    expect(
      [...entries.keys()].some((name) => name.startsWith('.robopomelo/') || name.startsWith('exports/')),
    ).toBe(false);
  });
  it('rejects stale source or changed selected evidence before reporting an output', async () => {
    const f = await fixture(true);
    const preview = await f.exports.preview(f.plan, f.expected, f.authorization);
    await writeFile(join(f.path, f.plan.attachments[0]!.sourcePath), 'changed');
    await expect(
      f.exports.persist(preview.previewId, {
        format: 'zip',
        name: 'bad.zip',
        authorization: f.authorization,
      }),
    ).rejects.toMatchObject({ code: 'EVIDENCE_MISMATCH' });
    await expect(f.root.stat('exports/bad.zip')).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(join(f.path, 'deployment.yaml'), 'changed: source');
    await expect(
      f.exports.persist(preview.previewId, { format: 'files', name: 'bad', authorization: f.authorization }),
    ).rejects.toMatchObject({ code: 'STALE_BASE' });
  });
  it('keeps failed streaming output incomplete and rejects unsafe member/output names', async () => {
    const f = await fixture(true);
    const preview = await f.exports.preview(f.plan, f.expected, f.authorization);
    await expect(
      f.exports.persist(preview.previewId, {
        format: 'zip',
        name: 'failed.zip',
        authorization: f.authorization,
        onProgress: async () => {
          throw new Error('export interrupted');
        },
      }),
    ).rejects.toThrow('export interrupted');
    await expect(f.root.stat('exports/failed.zip')).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await f.root.list('exports')).some((name) => name.startsWith('.incomplete-'))).toBe(true);
    await expect(
      f.exports.preview(
        {
          ...f.plan,
          members: [
            ...f.plan.members,
            { path: '../escape', mediaType: 'text/plain', bytes: Buffer.from('bad') },
          ],
        },
        f.expected,
        f.authorization,
      ),
    ).rejects.toThrow();
    await expect(
      f.exports.persist(preview.previewId, {
        format: 'zip',
        name: '../escape.zip',
        authorization: f.authorization,
      }),
    ).rejects.toThrow();
  });
  it('rejects portable member collisions, inconsistent manifests and oversized declared payloads', async () => {
    const f = await fixture();
    await expect(
      f.exports.preview(
        { ...f.plan, members: [...f.plan.members, { ...f.plan.members[0]!, path: 'DEPLOYMENT.yaml' }] },
        f.expected,
        f.authorization,
      ),
    ).rejects.toMatchObject({ code: 'PATH_COLLISION' });
    const malformed = {
      ...f.plan,
      members: f.plan.members.map((member) =>
        member.path === 'deployment-brief.md'
          ? { ...member, bytes: Buffer.from('changed after manifest') }
          : member,
      ),
    };
    await expect(f.exports.preview(malformed, f.expected, f.authorization)).rejects.toMatchObject({
      code: 'EXPORT_INVALID',
    });
    const attachments = Array.from({ length: 9 }, (_, i) => ({
      path: `evidence/${i}.bin`,
      sourcePath: `evidence/${i}.bin`,
      evidenceId: `e-${i}`,
      mediaType: 'application/octet-stream',
      size: 256 * 1024 * 1024,
      sha256: 'a'.repeat(64),
    }));
    await expect(
      f.exports.preview({ ...f.plan, attachments }, f.expected, f.authorization),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });
});
