import { it, expect, vi } from 'vitest';
import { sessionFixture, snapshot, commitInput } from './helpers/session-fixture.js';
import { transactionBase } from '../../packages/project-fs/src/transactions/io.js';
import { ExportService } from '../../packages/project-fs/src/export/service.js';
import { generateArtifacts } from '@robopomelo/artifacts';
import { sha256 } from '@robopomelo/core';
it('flushes a discoverable journal and all ancestors before replacing source', async () => {
  const f = await sessionFixture();
  try {
    const events: string[] = [],
      sync = f.root.fsyncDirectory.bind(f.root),
      replace = f.root.renameReplace.bind(f.root);
    vi.spyOn(f.root, 'fsyncDirectory').mockImplementation(async (path) => {
      events.push(`flush:${path ?? ''}`);
      return sync(path);
    });
    vi.spyOn(f.root, 'renameReplace').mockImplementation(async (from, to) => {
      events.push(`publish:${to}`);
      return replace(from, to);
    });
    await f.session.commit(commitInput(await snapshot(f.session), 'durable-change', f.authorization));
    const before = events.slice(0, events.indexOf('publish:deployment.yaml'));
    for (const path of [transactionBase('durable-change'), '.robopomelo/recovery', '.robopomelo', ''])
      expect(before).toContain(`flush:${path}`);
  } finally {
    vi.restoreAllMocks();
    await f.close();
  }
});
it.each(['files', 'zip'] as const)('flushes export directories before %s publication', async (format) => {
  const f = await sessionFixture();
  try {
    await f.root.mkdir('evidence');
    await f.root.mkdir('evidence/nested');
    const bytes = Buffer.from('Fictional evidence');
    const handle = await f.root.createExclusive('evidence/nested/site.txt');
    await handle.write(bytes);
    await handle.close();
    await f.session.commit(
      commitInput(await snapshot(f.session), 'attach', f.authorization, [
        {
          op: 'add',
          collection: 'evidence',
          record: {
            id: 'site-evidence',
            title: 'Fictional site',
            description: null,
            ownerId: null,
            sourceEvidenceIds: [],
            extensions: {},
            purpose: 'planning',
            provenance: { state: 'provided', value: 'Fixture' },
            location: {
              kind: 'attachment',
              path: 'evidence/nested/site.txt',
              sha256: sha256(bytes),
              size: bytes.length,
            },
            required: false,
            relatedIds: [],
          },
        },
      ]),
    );
    const current = await snapshot(f.session),
      plan = generateArtifacts({
        source: (await f.root.readFile('deployment.yaml')).toString('utf8'),
        snapshot: current,
        selectedEvidenceIds: ['site-evidence'],
      });
    const authority = f.trust.authorizeRun(
      { ...f.root.identity(), projectId: f.source.project.id },
      ['inspect', 'export'],
      'autonomous',
    );
    const service = new ExportService(f.session),
      preview = await service.preview(
        plan,
        { sourceRevision: current.sourceRevision, sourceHash: current.sourceHash },
        authority,
      );
    const events: string[] = [],
      sync = f.root.fsyncDirectory.bind(f.root),
      publish = f.root.publishExportDirectory.bind(f.root),
      rename = f.root.renameNoReplace.bind(f.root);
    vi.spyOn(f.root, 'fsyncDirectory').mockImplementation(async (path) => {
      events.push(`flush:${path ?? ''}`);
      return sync(path);
    });
    vi.spyOn(f.root, 'publishExportDirectory').mockImplementation(async (...args) => {
      events.push(`publish:${args[0]}`);
      return publish(...args);
    });
    vi.spyOn(f.root, 'renameNoReplace').mockImplementation(async (from, to) => {
      events.push(`publish:${from}`);
      return rename(from, to);
    });
    await service.persist(preview.previewId, { format, name: 'durable-output', authorization: authority });
    const index = events.findIndex((event) => event.startsWith('publish:exports/')),
      stage = events[index]!.slice('publish:'.length),
      before = events.slice(0, index);
    for (const path of format === 'files'
      ? [`${stage}/evidence/nested`, `${stage}/evidence`, stage, 'exports', '']
      : ['exports', ''])
      expect(before, path).toContain(`flush:${path}`);
  } finally {
    vi.restoreAllMocks();
    await f.close();
  }
});
