import { it, expect } from 'vitest';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '@robopomelo/core';
import type { PatchEnvelope } from '@robopomelo/spec';
import { MigrationService } from '../../../packages/project-fs/src/migrate.js';
import { fixture } from './helpers/commands.js';
it('restores a verified backup into an explicitly selected empty folder without changing current source', async () => {
  const f = await fixture();
  try {
    await f.project.grant(['author'], 'autonomous', false);
    const backup = await f.project.withProject((selected) =>
      new MigrationService(f.project.requireSession(selected)).backup({
        authorization: f.project.authorization(selected),
        actor: { kind: 'human', name: 'Fixture recorder' },
      }),
    );
    expect((await f.run(['migrate', '--recover', backup.manifestPath])).data).toMatchObject({
      kind: 'backup-only',
      sourceHash: backup.sourceHash,
    });
    const patch: PatchEnvelope = await f.patch();
    patch.operations = [{ op: 'project', fields: { name: 'Current work' } }];
    await f.run(['patch', 'apply', '-', '--authorize', 'author'], patch);
    const current = await readFile(join(f.path, 'deployment.yaml'));
    const destination = join(f.root, 'restored');
    await mkdir(destination);
    const result = await f.run([
      'migrate',
      '--restore-backup',
      backup.manifestPath,
      '--destination',
      destination,
      '--actor',
      JSON.stringify({ kind: 'human', name: 'Recovery engineer' }),
      '--authorize',
      'author',
    ]);
    expect(result.data).toMatchObject({
      kind: 'restored',
      requiresFreshTrust: true,
      sourceHash: backup.sourceHash,
    });
    expect(sha256(await readFile(join(destination, 'deployment.yaml')))).toBe(backup.sourceHash);
    expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(current);
    await f.project.open(destination);
    expect(f.project.status().scopes).toEqual(['inspect']);
  } finally {
    await f.close();
  }
});
it('requires explicit recovery destination authority and rejects ambiguous migration modes', async () => {
  const f = await fixture();
  try {
    const destination = join(f.root, 'empty');
    await mkdir(destination);
    await expect(
      f.run([
        'migrate',
        '--restore-backup',
        'backups/example/manifest.json',
        '--destination',
        destination,
        '--actor',
        '{"kind":"human","name":"Engineer"}',
      ]),
    ).rejects.toMatchObject({ code: 'SCOPE_REQUIRED' });
    expect(await readdir(destination)).toEqual([]);
    await expect(
      f.run(['migrate', '--target', '1.0.0', '--recover', 'backups/example/manifest.json']),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' });
  } finally {
    await f.close();
  }
});
