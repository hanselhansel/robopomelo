import { randomUUID } from 'node:crypto';
import type { Actor } from '@robopomelo/spec';
import { checkSchema } from '@robopomelo/spec';
import type { ProjectSession } from './session.js';
import type { Authorization } from './contracts.js';
import type { SafeRoot } from './fs/safe-fs.js';
import { acquireLock, type LockLease } from './fs/lock.js';
import { ProjectFsError } from './errors.js';
import { byteHash } from './transactions/digest.js';
import { immutable, jsonWrite } from './transactions/io.js';
import { writeInitialHistory } from './history.js';
import { recoverMigration } from './migration/recover.js';
import { sourceHeader, createBackup, verifyBackup, copyVerified } from './migration/backup.js';
import {
  planMigration,
  evaluateMigration,
  type MigrationAdapter,
  type MigrationPlan,
} from './migration/adapter.js';
export type { MigrationAdapter } from './migration/adapter.js';
interface MigrationAuthority {
  authorization: Authorization;
  actor: Actor;
}
export class MigrationService {
  #registry = new Map<string, MigrationAdapter>();
  #plans = new Map<string, MigrationPlan>();
  constructor(
    private readonly session: ProjectSession,
    adapters: MigrationAdapter[] = [],
  ) {
    for (const adapter of adapters) {
      const key = `${adapter.from}->${adapter.to}`;
      if (
        !adapter.from ||
        !adapter.to ||
        adapter.from === adapter.to ||
        this.#registry.has(key) ||
        typeof adapter.validateSource !== 'function' ||
        typeof adapter.transform !== 'function' ||
        typeof adapter.validateTarget !== 'function'
      )
        throw new ProjectFsError(
          'MIGRATION_INVALID',
          'Migration adapters must be unique validated code registrations.',
        );
      this.#registry.set(key, adapter);
    }
  }
  #binding() {
    return { ...this.session.options.root.identity(), projectId: this.session.options.projectId };
  }
  async preview(target: string) {
    const { root, trust, authorization, projectId } = this.session.options;
    await trust.withAuthorization(this.#binding(), authorization, ['inspect'], async () => {});
    const bytes = await root.readFile('deployment.yaml'),
      header = sourceHeader(bytes, projectId);
    if (target === '1.0.0' && header.specVersion === target) {
      if (checkSchema(header.value).length)
        throw new ProjectFsError('SOURCE_UNREADABLE', 'Current source schema is invalid.');
      return {
        kind: 'noop' as const,
        from: target,
        to: target,
        sourceHash: header.sourceHash,
        sourceRevision: header.sourceRevision,
      };
    }
    const adapter = this.#registry.get(`${header.specVersion}->${target}`);
    if (!adapter || target !== '1.0.0')
      throw new ProjectFsError(
        'UNSUPPORTED_MIGRATION',
        'No installed validated adapter can migrate this source to the requested supported target.',
      );
    const plan = await planMigration(this.session.options, adapter, bytes),
      previewId = randomUUID();
    if (this.#plans.size >= 16) this.#plans.delete(this.#plans.keys().next().value!);
    this.#plans.set(previewId, plan);
    return {
      kind: 'migration' as const,
      previewId,
      from: plan.from,
      to: plan.to,
      sourceHash: plan.sourceHash,
      sourceRevision: plan.sourceRevision,
      backupRequired: true,
    };
  }
  async backup(input: MigrationAuthority) {
    const { root, trust } = this.session.options;
    const lease = await acquireLock(root, 'project', { timeoutMs: 10_000 });
    try {
      await trust.withAuthorization(this.#binding(), input.authorization, ['author'], async () => {});
      return await createBackup(
        root,
        await root.readFile('deployment.yaml'),
        {
          projectId: this.session.options.projectId,
          actor: input.actor,
          createdAt: this.session.options.clock(),
        },
        (action) => trust.withAuthorization(this.#binding(), input.authorization, ['author'], action),
      );
    } finally {
      await lease.release();
    }
  }
  async apply(previewId: string, input: MigrationAuthority & { backup: boolean }) {
    if (input.backup !== true)
      throw new ProjectFsError(
        'BACKUP_REQUIRED',
        'Explicit migration requires a verified restorable backup.',
      );
    const plan = this.#plans.get(previewId);
    if (!plan)
      throw new ProjectFsError(
        'MIGRATION_PREVIEW_EXPIRED',
        'Migration preview does not belong to this session.',
      );
    const { root, trust, projectId } = this.session.options,
      lease = await acquireLock(root, 'project', { timeoutMs: 10_000 });
    try {
      if (byteHash(await root.readFile('deployment.yaml')) !== plan.sourceHash)
        throw new ProjectFsError('STALE_BASE', 'Source changed since migration preview.');
      const scopes = await trust.withAuthorization(
        this.#binding(),
        input.authorization,
        ['author'],
        async (grant) => [...grant.scopes],
      );
      const bytes = await evaluateMigration(this.session.options, plan, input.actor, scopes);
      const backup = await createBackup(root, plan.sourceBytes, {
        projectId,
        actor: input.actor,
        createdAt: this.session.options.clock(),
      });
      await verifyBackup(root, backup.manifestPath, projectId);
      const base = backup.manifestPath.slice(0, -'/manifest.json'.length),
        candidate = `${base}/candidate.yaml`,
        replacement = `${base}/replacement.yaml`;
      await immutable(root, candidate, bytes);
      await immutable(root, replacement, bytes);
      await jsonWrite(root, `${base}/migration.json`, {
        version: 1,
        projectId,
        from: plan.from,
        to: plan.to,
        sourceHash: plan.sourceHash,
        targetHash: byteHash(bytes),
        sourceRevision: plan.sourceRevision,
        targetRevision: plan.nextRevision,
        actor: input.actor,
      });
      await root.fsyncDirectory(base);
      await trust.withAuthorization(this.#binding(), input.authorization, ['author'], async () => {
        if (byteHash(await root.readFile('deployment.yaml')) !== plan.sourceHash)
          throw new ProjectFsError('STALE_BASE', 'Source changed while backing up migration.');
        await root.renameReplace(replacement, 'deployment.yaml');
        await root.fsyncDirectory();
      });
      try {
        await writeInitialHistory(root, bytes, { projectId, actor: input.actor });
        await jsonWrite(root, `${base}/applied.json`, {
          version: 1,
          targetHash: byteHash(bytes),
          targetRevision: plan.nextRevision,
        });
        await root.fsyncDirectory(base);
      } catch (error) {
        throw Object.assign(
          new ProjectFsError(
            'MIGRATION_COMMITTED',
            `Source migrated, but bookkeeping is incomplete. Finish recovery using ${backup.manifestPath}.`,
          ),
          { backupManifest: backup.manifestPath, sourceHash: byteHash(bytes), cause: error },
        );
      }
      this.#plans.delete(previewId);
      return {
        kind: 'migrated' as const,
        from: plan.from,
        to: plan.to,
        sourceHash: byteHash(bytes),
        sourceRevision: plan.nextRevision,
        backup,
      };
    } finally {
      await lease.release();
    }
  }
  async recover(manifestPath: string) {
    return recoverMigration(this.session.options, manifestPath);
  }
  async restoreBackup(manifestPath: string, destination: SafeRoot, input: MigrationAuthority) {
    const { root, trust, projectId } = this.session.options;
    await trust.withAuthorization(this.#binding(), input.authorization, ['author'], async () => {});
    const manifest = await verifyBackup(root, manifestPath, projectId);
    if ((await destination.list()).length)
      throw new ProjectFsError(
        'DESTINATION_NOT_EMPTY',
        'Restore backup only into an explicitly selected empty folder.',
      );
    const sourceLock = await acquireLock(root, 'project', { timeoutMs: 10_000 });
    let targetLock: LockLease | undefined;
    try {
      targetLock = await acquireLock(destination, 'project', { timeoutMs: 10_000 });
      if ((await destination.list()).some((name) => name !== '.robopomelo-project.lock'))
        throw new ProjectFsError(
          'DESTINATION_NOT_EMPTY',
          'Destination changed before the restore lock was acquired.',
        );
      const base = manifestPath.slice(0, -'/manifest.json'.length),
        stage = `.restore-source-${randomUUID()}.yaml`;
      for (const file of manifest.files)
        await copyVerified(
          root,
          `${base}/files/${file.path}`,
          destination,
          file.path === 'deployment.yaml' ? stage : file.path,
          file,
        );
      await trust.withAuthorization(this.#binding(), input.authorization, ['author'], async () => {
        await destination.renameNoReplace(stage, 'deployment.yaml');
        await destination.fsyncDirectory();
      });
      return {
        kind: 'restored' as const,
        sourceHash: manifest.sourceHash,
        sourceRevision: manifest.sourceRevision,
        requiresFreshTrust: true,
      };
    } finally {
      try {
        await targetLock?.release();
      } finally {
        await sourceLock.release();
      }
    }
  }
}
