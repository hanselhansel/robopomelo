import { it, expect, vi } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sessionFixture, actor } from './helpers/session-fixture.js';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
import { MigrationService } from '../../packages/project-fs/src/migrate.js';
function observe(root: SafeRoot) {
  const events: string[] = [],
    create = root.createExclusive.bind(root),
    sync = root.fsyncDirectory.bind(root),
    rename = root.renameNoReplace.bind(root);
  vi.spyOn(root, 'createExclusive').mockImplementation(async (path) => {
    events.push(`create:${path}`);
    return create(path);
  });
  vi.spyOn(root, 'fsyncDirectory').mockImplementation(async (path) => {
    events.push(`flush:${path ?? ''}`);
    return sync(path);
  });
  vi.spyOn(root, 'renameNoReplace').mockImplementation(async (from, to) => {
    events.push(`publish:${to}`);
    return rename(from, to);
  });
  return events;
}
it('flushes populated member directories and their ancestors before backup/restore publication', async () => {
  const f = await sessionFixture();
  let destination: SafeRoot | undefined;
  try {
    await f.root.mkdir('evidence');
    await f.root.mkdir('evidence/nested');
    const file = await f.root.createExclusive('evidence/nested/site.txt');
    await file.write(Buffer.from('Fictional evidence'));
    await file.close();
    const events = observe(f.root),
      service = new MigrationService(f.session),
      backup = await service.backup({ authorization: f.authorization, actor });
    const base = backup.manifestPath.slice(0, -'/manifest.json'.length),
      published = events.indexOf(`create:${backup.manifestPath}`),
      before = events.slice(0, published);
    const copied = before.findLastIndex((event) => event.startsWith('create:') && event.includes('/files/'));
    for (const path of [
      `${base}/files/evidence/nested`,
      `${base}/files/evidence`,
      `${base}/files`,
      base,
      '.robopomelo/recovery',
      '.robopomelo',
      '',
    ])
      expect(before.lastIndexOf(`flush:${path}`), path).toBeGreaterThan(copied);
    const target = join(f.path, 'restored-copy');
    await mkdir(target);
    destination = await SafeRoot.open(target);
    const restoredEvents = observe(destination);
    await service.restoreBackup(backup.manifestPath, destination, { authorization: f.authorization, actor });
    const publication = restoredEvents.indexOf('publish:deployment.yaml'),
      prepared = restoredEvents.slice(0, publication),
      lastCopy = prepared.findLastIndex((event) => event.startsWith('create:'));
    for (const path of ['evidence/nested', 'evidence', ''])
      expect(prepared.lastIndexOf(`flush:${path}`), path).toBeGreaterThan(lastCopy);
  } finally {
    vi.restoreAllMocks();
    await destination?.close();
    await f.close();
  }
});
