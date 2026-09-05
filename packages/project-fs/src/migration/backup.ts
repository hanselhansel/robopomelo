import { randomUUID, createHash } from 'node:crypto';
import type { Actor } from '@robopomelo/spec';
import type { SafeRoot, WriteHandle } from '../fs/safe-fs.js';
import { ProjectFsError } from '../errors.js';
import { parseSource } from '../yaml/parse.js';
import { byteHash } from '../transactions/digest.js';
import { directory, jsonRead, jsonWrite, missing } from '../transactions/io.js';
import { closed, isHash, isId, validActor, validTimestamp } from '../transactions/metadata.js';
import { projectRelativePath, portableNameKey } from '../fs/paths.js';
import { verifyFile } from '../transactions/evidence.js';
import { flushContainingDirectories } from '../fs/durability.js';
export interface BackupFile {
  path: string;
  size: number;
  sha256: string;
}
export interface BackupManifest {
  version: 1;
  projectId: string;
  sourceRevision: string;
  sourceHash: string;
  specVersion: string;
  createdAt: string;
  actor: Actor;
  complete: true;
  files: BackupFile[];
  excluded: string[];
}
export interface BackupResult {
  manifestPath: string;
  sourceHash: string;
  fileCount: number;
  bytes: number;
}
export function sourceHeader(bytes: Uint8Array, projectId: string) {
  const source = parseSource(bytes),
    value = source.value;
  const project = value.project as { id?: unknown } | undefined,
    meta = value.meta as { revisionId?: unknown } | undefined;
  if (project?.id !== projectId || !isId(meta?.revisionId) || typeof value.specVersion !== 'string')
    throw new ProjectFsError(
      'SOURCE_UNREADABLE',
      'Migration source requires matching project identity, revision and version.',
    );
  return {
    source,
    value,
    sourceRevision: meta.revisionId,
    specVersion: value.specVersion,
    sourceHash: byteHash(bytes),
  };
}
const permitted = (path: string) =>
  path === 'deployment.yaml' || path.startsWith('evidence/') || path.startsWith('.robopomelo/');
async function collect(root: SafeRoot): Promise<string[]> {
  const result = ['deployment.yaml'];
  async function walk(path: string) {
    if (/^\.robopomelo\/recovery\/migration-/.test(path)) return;
    const stat = await root.stat(path);
    if (stat.kind === 'file') {
      result.push(path);
      if (result.length > 10_000) throw new ProjectFsError('LIMIT_EXCEEDED', 'Backup exceeds 10,000 files.');
      return;
    }
    for (const name of await root.list(path)) await walk(`${path}/${name}`);
  }
  for (const path of ['evidence', '.robopomelo']) {
    try {
      await root.stat(path);
    } catch (error) {
      if (!missing(error)) throw error;
      continue;
    }
    await walk(path);
  }
  return result.sort();
}
async function parents(root: SafeRoot, path: string) {
  const parts = path.split('/');
  for (let i = 1; i < parts.length; i++) await directory(root, parts.slice(0, i).join('/'));
}
export async function copyVerified(
  source: SafeRoot,
  sourcePath: string,
  destination: SafeRoot,
  targetPath: string,
  expected?: BackupFile,
): Promise<BackupFile> {
  await parents(destination, targetPath);
  const input = await source.openRead(sourcePath);
  let output: WriteHandle | undefined;
  let size = 0;
  const hash = createHash('sha256');
  try {
    output = await destination.createExclusive(targetPath);
    const before = await input.stat();
    for (;;) {
      const bytes = await input.readChunk();
      if (!bytes.length) break;
      size += bytes.length;
      if (!Number.isSafeInteger(size) || (expected && size > expected.size))
        throw new ProjectFsError('BACKUP_MISMATCH', 'Backup file size changed.');
      hash.update(bytes);
      await output.write(bytes);
    }
    const after = await input.stat(),
      sha256 = hash.digest('hex');
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      (expected && (expected.size !== size || expected.sha256 !== sha256))
    )
      throw new ProjectFsError('BACKUP_MISMATCH', 'Backup source changed while copying.');
    await output.sync();
    return { path: sourcePath, size, sha256 };
  } finally {
    try {
      await output?.close();
    } finally {
      await input.close();
    }
  }
}
/** Caller holds the source project lock. Existing backup subtrees are excluded. */
export async function createBackup(
  root: SafeRoot,
  bytes: Buffer,
  metadata: { projectId: string; actor: Actor; createdAt: string },
  publish: (action: () => Promise<void>) => Promise<void> = (action) => action(),
): Promise<BackupResult> {
  const header = sourceHeader(bytes, metadata.projectId);
  if (!validActor(metadata.actor) || !validTimestamp(metadata.createdAt))
    throw new ProjectFsError('INVALID_PROVENANCE', 'Backup requires a recorder and timestamp.');
  const paths = await collect(root),
    base = `.robopomelo/recovery/migration-${randomUUID()}`;
  await parents(root, `${base}/files/deployment.yaml`);
  const files: BackupFile[] = [];
  for (const path of paths) {
    const file = await copyVerified(root, path, root, `${base}/files/${path}`);
    files.push({ ...file, path });
  }
  await flushContainingDirectories(
    root,
    files.map((file) => `${base}/files/${file.path}`),
  );
  if (byteHash(await root.readFile('deployment.yaml')) !== header.sourceHash)
    throw new ProjectFsError('STALE_BASE', 'Project source changed during backup.');
  const copiedSource = files.find((file) => file.path === 'deployment.yaml');
  if (copiedSource?.sha256 !== header.sourceHash)
    throw new ProjectFsError('BACKUP_MISMATCH', 'Backed-up source differs from its expected bytes.');
  const manifest: BackupManifest = {
    version: 1,
    projectId: metadata.projectId,
    sourceRevision: header.sourceRevision,
    sourceHash: header.sourceHash,
    specVersion: header.specVersion,
    createdAt: metadata.createdAt,
    actor: metadata.actor,
    complete: true,
    files,
    excluded: [
      'exports/',
      '.robopomelo-*.lock',
      '.robopomelo-*.recovery',
      '.robopomelo/recovery/migration-*',
    ],
  };
  const manifestPath = `${base}/manifest.json`;
  await publish(async () => {
    if (byteHash(await root.readFile('deployment.yaml')) !== header.sourceHash)
      throw new ProjectFsError('STALE_BASE', 'Project source changed before completing backup.');
    await jsonWrite(root, manifestPath, manifest);
    await root.fsyncDirectory(base);
  });
  return {
    manifestPath,
    sourceHash: header.sourceHash,
    fileCount: files.length,
    bytes: files.reduce((sum, file) => sum + file.size, 0),
  };
}
export async function readBackup(
  root: SafeRoot,
  manifestPath: string,
  projectId: string,
): Promise<BackupManifest> {
  projectRelativePath(manifestPath);
  if (!/^\.robopomelo\/recovery\/migration-[a-f0-9-]{36}\/manifest\.json$/.test(manifestPath))
    throw new ProjectFsError('INVALID_PATH', 'Select a generated migration backup manifest.');
  const value = await jsonRead(root, manifestPath),
    m = value as BackupManifest;
  if (
    !closed(value, [
      'version',
      'projectId',
      'sourceRevision',
      'sourceHash',
      'specVersion',
      'createdAt',
      'actor',
      'complete',
      'files',
      'excluded',
    ]) ||
    m.version !== 1 ||
    m.projectId !== projectId ||
    !isId(m.sourceRevision) ||
    !isHash(m.sourceHash) ||
    typeof m.specVersion !== 'string' ||
    !validTimestamp(m.createdAt) ||
    !validActor(m.actor) ||
    m.complete !== true ||
    !Array.isArray(m.files) ||
    m.files.length > 10_000 ||
    !Array.isArray(m.excluded) ||
    m.excluded.some((item) => typeof item !== 'string')
  )
    throw new ProjectFsError('BACKUP_INVALID', 'Backup manifest is invalid or incomplete.');
  const names = new Set<string>();
  for (const f of m.files) {
    if (
      !closed(f, ['path', 'size', 'sha256']) ||
      typeof f.path !== 'string' ||
      !permitted(f.path) ||
      !Number.isSafeInteger(f.size) ||
      f.size < 0 ||
      !isHash(f.sha256)
    )
      throw new ProjectFsError('BACKUP_INVALID', 'Backup member is invalid.');
    projectRelativePath(f.path);
    const key = portableNameKey(f.path);
    if (names.has(key)) throw new ProjectFsError('BACKUP_INVALID', 'Backup contains colliding paths.');
    names.add(key);
  }
  const source = m.files.find((file) => file.path === 'deployment.yaml');
  if (source?.sha256 !== m.sourceHash)
    throw new ProjectFsError('BACKUP_INVALID', 'Backup source identity is inconsistent.');
  return m;
}
export async function verifyBackup(
  root: SafeRoot,
  manifestPath: string,
  projectId: string,
): Promise<BackupManifest> {
  const manifest = await readBackup(root, manifestPath, projectId),
    base = manifestPath.slice(0, -'/manifest.json'.length);
  for (const file of manifest.files)
    await verifyFile(root, `${base}/files/${file.path}`, file.sha256, file.size);
  return manifest;
}
