import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile, symlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { checkSchema } from '@robopomelo/spec';
import { sessionFixture, actor } from './helpers/session-fixture.js';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
import { MigrationService, type MigrationAdapter } from '../../packages/project-fs/src/migrate.js';
import { byteHash, digestValue } from '../../packages/project-fs/src/transactions/digest.js';
import { jsonRead } from '../../packages/project-fs/src/transactions/io.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function fixture(legacy = false) {
  const f = await sessionFixture();
  cleanup.push(f.close);
  if (legacy) {
    const source = parse(await readFile(join(f.path, 'deployment.yaml'), 'utf8'));
    source.specVersion = '0.0.0-synthetic';
    await writeFile(join(f.path, 'deployment.yaml'), '# synthetic migration fixture\n' + stringify(source));
  }
  return f;
}
const synthetic: MigrationAdapter = {
  from: '0.0.0-synthetic',
  to: '1.0.0',
  validateSource: (value) =>
    !!value &&
    typeof value === 'object' &&
    (value as { specVersion?: string }).specVersion === '0.0.0-synthetic' &&
    checkSchema({ ...value, specVersion: '1.0.0' }).length === 0,
  transform: (value) => ({
    ...value,
    specVersion: '1.0.0',
    project: { ...(value.project as object), name: 'Converted synthetic fixture' },
  }),
  validateTarget: (value) => checkSchema(value).length === 0,
};
describe('explicit migration adapters and verified backups', () => {
  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'finishes only bookkeeping after a real failure beyond migration source replacement',
    async () => {
      const f = await fixture(true);
      await f.root.mkdir('.robopomelo');
      await f.root.mkdir('.robopomelo/history');
      await chmod(join(f.path, '.robopomelo/history'), 0o500);
      const service = new MigrationService(f.session, [synthetic]);
      const plan = await service.preview('1.0.0');
      if (plan.kind !== 'migration') throw new Error('Expected preview');
      let failure: unknown;
      try {
        await service.apply(plan.previewId, { authorization: f.authorization, actor, backup: true });
      } catch (error) {
        failure = error;
      } finally {
        await chmod(join(f.path, '.robopomelo/history'), 0o700);
      }
      expect(failure).toMatchObject({ code: 'MIGRATION_COMMITTED' });
      const path = (failure as { backupManifest: string }).backupManifest;
      expect(parse(await readFile(join(f.path, 'deployment.yaml'), 'utf8')).specVersion).toBe('1.0.0');
      expect(await service.recover(path)).toMatchObject({ kind: 'finalized' });
    },
  );
  it('has no fictitious legacy converter and leaves a current-version noop read-only', async () => {
    const f = await fixture();
    const service = new MigrationService(f.session);
    expect(await service.preview('1.0.0')).toMatchObject({ kind: 'noop', from: '1.0.0', to: '1.0.0' });
    await expect(service.preview('7.0.0')).rejects.toMatchObject({ code: 'UNSUPPORTED_MIGRATION' });
    await expect(f.root.stat('.robopomelo/recovery')).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('backs up managed source/history/evidence and restores verified bytes to a new empty root', async () => {
    const f = await fixture();
    await f.root.mkdir('evidence');
    let handle = await f.root.createExclusive('evidence/source.txt');
    await handle.write(Buffer.from('original evidence'));
    await handle.close();
    await f.root.mkdir('.robopomelo');
    await f.root.mkdir('.robopomelo/history');
    handle = await f.root.createExclusive('.robopomelo/history/opaque-original');
    await handle.write(Buffer.from('preserved historical bytes'));
    await handle.close();
    await f.root.mkdir('exports');
    await writeFile(join(f.path, 'exports', 'omit'), 'derived output');
    const service = new MigrationService(f.session);
    const backup = await service.backup({ authorization: f.authorization, actor });
    const manifest = (await jsonRead(f.root, backup.manifestPath)) as {
      files: { path: string; sha256: string }[];
      excluded: string[];
    };
    expect(manifest.files.map((file) => file.path)).toContain('.robopomelo/history/opaque-original');
    expect(manifest.files.some((file) => file.path.startsWith('exports/'))).toBe(false);
    const destinationPath = join(f.base, 'restored');
    await mkdir(destinationPath);
    const destination = await SafeRoot.open(destinationPath);
    cleanup.push(() => destination.close());
    await service.restoreBackup(backup.manifestPath, destination, { authorization: f.authorization, actor });
    for (const file of manifest.files)
      expect(byteHash(await destination.readFile(file.path))).toBe(file.sha256);
    await expect(
      f.trust.withAuthorization(
        { ...destination.identity(), projectId: 'project-1' },
        f.authorization,
        ['author'],
        async () => {},
      ),
    ).rejects.toMatchObject({ code: 'GRANT_REVOKED' });
  });
  it('applies an injected synthetic adapter only after a complete restorable backup', async () => {
    const f = await fixture(true),
      old = await readFile(join(f.path, 'deployment.yaml'));
    const service = new MigrationService(f.session, [synthetic]);
    const preview = await service.preview('1.0.0');
    if (preview.kind !== 'migration') throw new Error('Expected synthetic adapter preview');
    await expect(
      service.apply(preview.previewId, { authorization: f.authorization, actor, backup: false }),
    ).rejects.toMatchObject({ code: 'BACKUP_REQUIRED' });
    const result = await service.apply(preview.previewId, {
      authorization: f.authorization,
      actor,
      backup: true,
    });
    expect(result.kind).toBe('migrated');
    const source = parse(await readFile(join(f.path, 'deployment.yaml'), 'utf8'));
    expect(source.specVersion).toBe('1.0.0');
    expect(source.project.name).toBe('Converted synthetic fixture');
    expect(source.extensions).toEqual(parse(old.toString()).extensions);
    const targetPath = join(f.base, 'prior-version');
    await mkdir(targetPath);
    const target = await SafeRoot.open(targetPath);
    cleanup.push(() => target.close());
    await service.restoreBackup(result.backup.manifestPath, target, {
      authorization: f.authorization,
      actor,
    });
    expect(await target.readFile('deployment.yaml')).toEqual(old);
  });
  it('preserves source when transformation, validation or backup confinement fails', async () => {
    const f = await fixture(true),
      before = await readFile(join(f.path, 'deployment.yaml'));
    await expect(
      new MigrationService(f.session, [
        {
          ...synthetic,
          transform: () => {
            throw new Error('adapter failed');
          },
        },
      ]).preview('1.0.0'),
    ).rejects.toThrow('adapter failed');
    await expect(
      new MigrationService(f.session, [{ ...synthetic, validateTarget: () => false }]).preview('1.0.0'),
    ).rejects.toMatchObject({ code: 'MIGRATION_INVALID' });
    const service = new MigrationService(f.session, [synthetic]);
    const preview = await service.preview('1.0.0');
    if (preview.kind !== 'migration') throw new Error('Expected preview');
    await f.root.mkdir('evidence');
    const outside = join(f.base, 'outside');
    await writeFile(outside, 'outside');
    await symlink(outside, join(f.path, 'evidence', 'link'), 'file');
    await expect(
      service.apply(preview.previewId, { authorization: f.authorization, actor, backup: true }),
    ).rejects.toThrow();
    expect(await readFile(join(f.path, 'deployment.yaml'))).toEqual(before);
  });
  it('rejects a changed source, tampered backup paths and nonempty restore destinations', async () => {
    const f = await fixture(true);
    const service = new MigrationService(f.session, [synthetic]);
    const preview = await service.preview('1.0.0');
    if (preview.kind !== 'migration') throw new Error('Expected preview');
    const original = await readFile(join(f.path, 'deployment.yaml'));
    await writeFile(join(f.path, 'deployment.yaml'), Buffer.concat([original, Buffer.from('# changed\n')]));
    await expect(
      service.apply(preview.previewId, { authorization: f.authorization, actor, backup: true }),
    ).rejects.toMatchObject({ code: 'STALE_BASE' });
    const backup = await service.backup({ authorization: f.authorization, actor });
    const path = join(f.base, 'target');
    await mkdir(path);
    const target = await SafeRoot.open(path);
    cleanup.push(() => target.close());
    await writeFile(join(path, 'keep'), 'untouched');
    await expect(
      service.restoreBackup(backup.manifestPath, target, { authorization: f.authorization, actor }),
    ).rejects.toMatchObject({ code: 'DESTINATION_NOT_EMPTY' });
    const value = (await jsonRead(f.root, backup.manifestPath)) as { files: { path: string }[] };
    value.files[0]!.path = '../escape';
    await writeFile(
      join(f.path, backup.manifestPath),
      JSON.stringify({ value, checksum: digestValue(value) }),
    );
    await expect(
      service.restoreBackup(backup.manifestPath, target, { authorization: f.authorization, actor }),
    ).rejects.toThrow();
    expect(await readFile(join(path, 'keep'), 'utf8')).toBe('untouched');
  });
});
