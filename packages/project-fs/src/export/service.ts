import { randomUUID, createHash } from 'node:crypto';
import type { ProjectSession } from '../session.js';
import type { Authorization, SourceIdentity } from '../contracts.js';
import { acquireLock } from '../fs/lock.js';
import { projectRelativePath } from '../fs/paths.js';
import { flushContainingDirectories } from '../fs/durability.js';
import { ProjectFsError } from '../errors.js';
import { directory } from '../transactions/io.js';
import { freezePlan, verifyFrozen } from './plan.js';
import { cancelled, memberStream, zipStream } from './streams.js';
import type { ExportPlan, ExportOptions, ExportResult, FrozenExport } from './contracts.js';
export type { ExportPlan, ExportOptions, ExportResult } from './contracts.js';
export class ExportService {
  #previews = new Map<string, FrozenExport>();
  constructor(private readonly session: ProjectSession) {}
  #binding() {
    return { ...this.session.options.root.identity(), projectId: this.session.options.projectId };
  }
  async preview(plan: ExportPlan, expected: SourceIdentity, authorization: Authorization) {
    await this.session.options.trust.withAuthorization(
      this.#binding(),
      authorization,
      ['export'],
      async () => {},
    );
    const frozen = await freezePlan(
        this.session.options.root,
        this.session.options.projectId,
        plan,
        expected,
      ),
      previewId = randomUUID();
    if (this.#previews.size >= 16) this.#previews.delete(this.#previews.keys().next().value!);
    this.#previews.set(previewId, frozen);
    return {
      previewId,
      ...expected,
      members: frozen.members.map(({ path, size, sha256, mediaType }) => ({ path, size, sha256, mediaType })),
      evidence: frozen.members
        .filter((member) => member.kind === 'attachment')
        .map((member) => member.evidenceId),
    };
  }
  async persist(previewId: string, options: ExportOptions): Promise<ExportResult> {
    const plan = this.#previews.get(previewId);
    if (!plan)
      throw new ProjectFsError(
        'EXPORT_PREVIEW_EXPIRED',
        'Export preview does not belong to this live project session.',
      );
    if (!['files', 'zip'].includes(options.format))
      throw new ProjectFsError('EXPORT_INVALID', 'Choose files or ZIP export.');
    const name = options.name ?? `review-${randomUUID()}${options.format === 'zip' ? '.zip' : ''}`;
    projectRelativePath(name);
    if (name.includes('/') || name.startsWith('.incomplete-'))
      throw new ProjectFsError('INVALID_PATH', 'Export output must be one portable name under exports/.');
    const final = `exports/${name}`,
      stage = `exports/.incomplete-${randomUUID()}${options.format === 'zip' ? '.zip' : ''}`,
      { root, trust } = this.session.options;
    await trust.withAuthorization(this.#binding(), options.authorization, ['export'], async () => {});
    cancelled(options.signal);
    const lock = await acquireLock(root, 'project', { timeoutMs: 10_000 });
    try {
      await verifyFrozen(root, plan);
      await directory(root, 'exports');
      let bytes = 0,
        sha256: string | undefined;
      if (options.format === 'zip') {
        const handle = await root.createExclusive(stage),
          hash = createHash('sha256');
        const output = zipStream(root, plan, options);
        try {
          for await (const chunk of output) {
            cancelled(options.signal);
            const part = Buffer.from(chunk);
            bytes += part.length;
            if (bytes > plan.payloadBytes + 100_000_000)
              throw new ProjectFsError('LIMIT_EXCEEDED', 'ZIP metadata exceeds the bounded output limit.');
            hash.update(part);
            await handle.write(part);
          }
          await handle.sync();
          sha256 = hash.digest('hex');
        } finally {
          output.destroy();
          await handle.close();
        }
      } else {
        await root.mkdir(stage);
        for (const member of plan.members) {
          const pieces = member.path.split('/');
          for (let i = 1; i < pieces.length; i++)
            await directory(root, `${stage}/${pieces.slice(0, i).join('/')}`);
          const handle = await root.createExclusive(`${stage}/${member.path}`);
          try {
            for await (const chunk of memberStream(root, member, options)) {
              bytes += chunk.length;
              await handle.write(chunk);
            }
            await handle.sync();
          } finally {
            await handle.close();
          }
        }
        await root.fsyncDirectory(stage);
      }
      await flushContainingDirectories(
        root,
        options.format === 'zip' ? [stage] : plan.members.map((member) => `${stage}/${member.path}`),
      );
      await trust.withAuthorization(this.#binding(), options.authorization, ['export'], async () => {
        cancelled(options.signal);
        await verifyFrozen(root, plan);
        await lock.assertHeld();
        if (options.format === 'zip') await root.renameNoReplace(stage, final);
        else
          await root.publishExportDirectory(
            stage,
            final,
            await root.stat(stage),
            await root.stat('.robopomelo-project.lock'),
          );
        await root.fsyncDirectory('exports');
      });
      return {
        path: final,
        format: options.format,
        ...plan.expected,
        memberCount: plan.members.length,
        bytes,
        ...(sha256 ? { sha256 } : {}),
      };
    } finally {
      await lock.release();
    }
  }
}
