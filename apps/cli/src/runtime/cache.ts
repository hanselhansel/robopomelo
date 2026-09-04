import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { SafeRoot } from '../../../../packages/project-fs/src/fs/safe-fs.js';
import { acquireLock } from '../../../../packages/project-fs/src/fs/lock.js';
import { machineDirectory } from '../../../../packages/project-fs/src/fs/machine-paths.js';
import { verifyRelease } from './verify.js';
import { parseRuntimeManifest } from './manifest.js';
import { inspectRuntimeArchive } from './archive.js';
import { extractRuntime } from './extract.js';
import { fileBytes, hashFile, readJson, writeJson, validatePayloadFiles } from './cache-io.js';
import { RuntimeError } from './errors.js';
import type {
  PayloadDigest,
  ReleaseMetadata,
  RuntimeDescriptor,
  UpdateOutcome,
  VerificationReceipt,
} from './contracts.js';
export type ReleaseVerifier = (
  metadata: ReleaseMetadata,
  digest: PayloadDigest,
  attestations: unknown,
) => Promise<VerificationReceipt>;
export interface CacheRef {
  directory: string;
  version: string;
  sha256: string;
}
export interface CachePointer {
  formatVersion: 1;
  active: CacheRef | null;
  previous: CacheRef | null;
  pendingVersion: string | null;
  lastOutcome: UpdateOutcome | null;
}
const empty = (): CachePointer => ({
  formatVersion: 1,
  active: null,
  previous: null,
  pendingVersion: null,
  lastOutcome: null,
});
const missing = (e: unknown) => (e as { code?: string }).code === 'ENOENT';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function ref(value: unknown): boolean {
  return (
    value === null ||
    (object(value) &&
      typeof value.directory === 'string' &&
      /^runtimes\/[a-f0-9-]{36}$/.test(value.directory) &&
      typeof value.version === 'string' &&
      typeof value.sha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(value.sha256))
  );
}
/** Cache lock is rooted here, completely separate from every project/settings lock. */
export class RuntimeCache {
  private readonly verify: ReleaseVerifier;
  constructor(
    private readonly options: { directory: string; verify?: ReleaseVerifier; clock?: () => string },
  ) {
    this.verify =
      options.verify ??
      ((metadata, digest, attestations) => verifyRelease(metadata, digest, attestations, options.clock));
  }
  async #root(create = false): Promise<SafeRoot | null> {
    const path = await machineDirectory(this.options.directory, create);
    return path ? SafeRoot.open(path) : null;
  }
  async #locked<T>(action: (root: SafeRoot) => Promise<T>): Promise<T> {
    const root = (await this.#root(true))!;
    try {
      const lock = await acquireLock(root, 'settings', { timeoutMs: 10000 });
      try {
        return await action(root);
      } finally {
        await lock.release();
      }
    } finally {
      await root.close();
    }
  }
  async #pointer(root: SafeRoot): Promise<CachePointer> {
    try {
      const p = await readJson(root, 'selection.json');
      if (
        !object(p) ||
        p.formatVersion !== 1 ||
        !ref(p.active) ||
        !ref(p.previous) ||
        (p.pendingVersion !== null && typeof p.pendingVersion !== 'string') ||
        !(p.lastOutcome === null || object(p.lastOutcome))
      )
        throw new RuntimeError('CACHE_INVALID', 'Runtime selection pointer is invalid.');
      return p as unknown as CachePointer;
    } catch (e) {
      if (missing(e)) return empty();
      throw e;
    }
  }
  async pointer(): Promise<CachePointer> {
    const root = await this.#root();
    if (!root) return empty();
    try {
      return await this.#pointer(root);
    } finally {
      await root.close();
    }
  }
  async #publish(root: SafeRoot, pointer: CachePointer): Promise<void> {
    const path = `.selection-${randomUUID()}.json`;
    await writeJson(root, path, pointer);
    await root.renameReplace(path, 'selection.json');
    await root.fsyncDirectory();
  }
  async #load(
    root: SafeRoot,
    directory: string,
    stagingReceipt?: VerificationReceipt,
  ): Promise<RuntimeDescriptor> {
    if (!/^runtimes\/[a-f0-9-]{36}$/.test(directory))
      throw new RuntimeError('CACHE_INVALID', 'Invalid runtime cache directory.');
    const metadata = (await readJson(root, `${directory}/metadata.json`)) as ReleaseMetadata;
    const digest = await hashFile(root, `${directory}/payload.tgz`),
      attestations = await readJson(root, `${directory}/attestations.json`);
    const receipt = await this.verify(metadata, digest, attestations);
    const saved =
      stagingReceipt ?? ((await readJson(root, `${directory}/verified.json`)) as VerificationReceipt);
    if (
      saved.sha256 !== receipt.sha256 ||
      saved.version !== receipt.version ||
      saved.sourceCommit !== receipt.sourceCommit ||
      saved.identity !== receipt.identity
    )
      throw new RuntimeError('RUNTIME_CORRUPT', 'Cached verification receipt does not match signed payload.');
    const archived = await inspectRuntimeArchive(fileBytes(root, `${directory}/payload.tgz`));
    const manifest = parseRuntimeManifest(JSON.parse(archived.manifestBytes.toString('utf8')));
    if (
      manifest.version !== metadata.version ||
      JSON.stringify([...manifest.files].sort((a, b) => a.path.localeCompare(b.path))) !==
        JSON.stringify(archived.files.sort((a, b) => a.path.localeCompare(b.path)))
    )
      throw new RuntimeError('RUNTIME_CORRUPT', 'Signed archive inventory differs from its manifest.');
    await root.stat(`${directory}/package`);
    const payload = await SafeRoot.open(join(root.identity().canonicalPath, directory, 'package'));
    try {
      const bytes = await payload.readFile('runtime-manifest.json', 1024 * 1024);
      if (!bytes.equals(archived.manifestBytes))
        throw new RuntimeError('RUNTIME_CORRUPT', 'Cached manifest differs from signed payload.');
      await validatePayloadFiles(payload, manifest);
    } finally {
      await payload.close();
    }
    return {
      manifest,
      directory: join(root.identity().canonicalPath, directory, 'package'),
      manifestDigest: createHash('sha256').update(archived.manifestBytes).digest('hex'),
      source: 'cache',
    };
  }
  async #directories(root: SafeRoot): Promise<string[]> {
    try {
      return (await root.list('runtimes'))
        .filter((p) => /^[a-f0-9-]{36}$/.test(p))
        .map((p) => `runtimes/${p}`);
    } catch (e) {
      if (missing(e)) return [];
      throw e;
    }
  }
  async list(): Promise<RuntimeDescriptor[]> {
    const root = await this.#root();
    if (!root) return [];
    try {
      const list: RuntimeDescriptor[] = [];
      for (const path of await this.#directories(root)) {
        try {
          await root.stat(`${path}/verified.json`);
        } catch (e) {
          if (missing(e)) continue;
          throw e;
        }
        list.push(await this.#load(root, path));
      }
      return list;
    } finally {
      await root.close();
    }
  }
  async get(version: string): Promise<RuntimeDescriptor | null> {
    const found = (await this.list()).filter((d) => d.manifest.version === version);
    if (found.length > 1 && new Set(found.map((d) => d.manifestDigest)).size > 1)
      throw new RuntimeError('CACHE_CONFLICT', 'Cached package version has conflicting verified contents.');
    return found[0] ?? null;
  }
  async install(
    metadata: ReleaseMetadata,
    download: (sink: (chunk: Uint8Array) => Promise<void>) => Promise<void>,
    attestations: unknown,
  ): Promise<RuntimeDescriptor> {
    return this.#locked(async (root) => {
      try {
        await root.mkdir('runtimes');
      } catch (e) {
        if ((e as { code?: string }).code !== 'EEXIST') throw e;
      }
      const directory = `runtimes/${randomUUID()}`;
      await root.mkdir(directory);
      await root.mkdir(`${directory}/package`);
      const file = await root.createExclusive(`${directory}/payload.tgz`),
        sha256 = createHash('sha256'),
        sha512 = createHash('sha512');
      let size = 0;
      try {
        await download(async (chunk) => {
          size += chunk.byteLength;
          if (size > 64 * 1024 * 1024)
            throw new RuntimeError('UPDATE_LIMIT', 'Runtime payload exceeds compressed byte limit.');
          sha256.update(chunk);
          sha512.update(chunk);
          await file.write(chunk);
        });
        await file.sync();
      } finally {
        await file.close();
      }
      const digest = { sha256: sha256.digest('hex'), sha512: sha512.digest('hex') };
      const receipt = await this.verify(metadata, digest, attestations);
      await writeJson(root, `${directory}/metadata.json`, metadata);
      await writeJson(root, `${directory}/attestations.json`, attestations);
      await extractRuntime(
        fileBytes(root, `${directory}/payload.tgz`),
        join(root.identity().canonicalPath, directory, 'package'),
      );
      const descriptor = await this.#load(root, directory, receipt);
      await writeJson(root, `${directory}/verified.json`, receipt);
      await root.fsyncDirectory(directory);
      return descriptor;
    });
  }
  async promote(runtime: RuntimeDescriptor, signal?: AbortSignal): Promise<void> {
    await this.#locked(async (root) => {
      const directory = (await this.#directories(root)).find(
        (path) => join(root.identity().canonicalPath, path, 'package') === runtime.directory,
      );
      if (!directory) throw new RuntimeError('CACHE_INVALID', 'Runtime is not in this managed cache.');
      const checked = await this.#load(root, directory);
      if (checked.manifestDigest !== runtime.manifestDigest)
        throw new RuntimeError('RUNTIME_CORRUPT', 'Runtime changed before promotion.');
      const pointer = await this.#pointer(root),
        digest = await hashFile(root, `${directory}/payload.tgz`);
      const active = { directory, version: checked.manifest.version, sha256: digest.sha256 };
      if (signal?.aborted) throw new RuntimeError('UPDATE_TIMEOUT', 'Update promotion was canceled.');
      await this.#publish(root, {
        ...pointer,
        previous: pointer.active?.directory === directory ? pointer.previous : pointer.active,
        active,
        pendingVersion: null,
      });
    });
  }
  async selectBundled(): Promise<void> {
    await this.#locked(async (root) => {
      const p = await this.#pointer(root);
      await this.#publish(root, {
        ...p,
        active: null,
        previous: p.active ?? p.previous,
        pendingVersion: null,
      });
    });
  }
  async restoreSelection(failedVersion: string, previous: CacheRef | null): Promise<void> {
    await this.#locked(async (root) => {
      const pointer = await this.#pointer(root);
      if (pointer.active?.version !== failedVersion) return;
      if (previous) await this.#load(root, previous.directory);
      await this.#publish(root, { ...pointer, active: previous, previous: null });
    });
  }
  async outcome(outcome: UpdateOutcome): Promise<void> {
    await this.#locked(async (root) => {
      const old = await this.#pointer(root);
      await this.#publish(root, { ...old, pendingVersion: outcome.pendingVersion, lastOutcome: outcome });
    });
  }
}
