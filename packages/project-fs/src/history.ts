import type { Actor, FieldDiff, ProjectSnapshot } from '@robopomelo/spec';
import type { SessionOptions } from './contracts.js';
import type { SafeRoot } from './fs/safe-fs.js';
import { ProjectFsError } from './errors.js';
import { byteHash } from './transactions/digest.js';
import {
  historyBase,
  immutable,
  jsonRead,
  jsonWrite,
  listOrEmpty,
  missing,
  directory,
} from './transactions/io.js';
import { isHash, isId } from './transactions/journal.js';
import type { Journal } from './transactions/journal.js';
import { deploymentBytes, snapshotBytes } from './transactions/snapshot.js';
import { closed, validActor, validDiff, validTimestamp } from './transactions/metadata.js';
export interface HistoryEntry {
  version: 1;
  projectId: string;
  sourceRevision: string;
  sourceHash: string;
  parentRevisionId: string | null;
  parentSourceHash: string | null;
  timestamp: string;
  origin: 'baseline' | 'commit' | 'external';
  mutationId: string | null;
  digest: string | null;
  actor: Actor | null;
  diff: FieldDiff[];
}
function validate(value: unknown, projectId: string, revision?: string): asserts value is HistoryEntry {
  const h = value as HistoryEntry;
  if (
    !closed(value, [
      'version',
      'projectId',
      'sourceRevision',
      'sourceHash',
      'parentRevisionId',
      'parentSourceHash',
      'timestamp',
      'origin',
      'mutationId',
      'digest',
      'actor',
      'diff',
    ]) ||
    !h ||
    typeof h !== 'object' ||
    h.version !== 1 ||
    h.projectId !== projectId ||
    !isId(h.sourceRevision) ||
    (revision !== undefined && h.sourceRevision !== revision) ||
    !isHash(h.sourceHash) ||
    (h.parentRevisionId !== null && !isId(h.parentRevisionId)) ||
    (h.parentSourceHash !== null && !isHash(h.parentSourceHash)) ||
    !['baseline', 'commit', 'external'].includes(h.origin) ||
    !validTimestamp(h.timestamp) ||
    !validDiff(h.diff) ||
    (h.actor !== null && !validActor(h.actor)) ||
    (h.origin !== 'baseline' && (h.actor === null || h.mutationId === null || h.digest === null)) ||
    (h.mutationId !== null && !isId(h.mutationId)) ||
    (h.digest !== null && !isHash(h.digest))
  )
    throw new ProjectFsError('HISTORY_TAMPERED', 'History metadata is invalid.');
}
export async function historyRead(
  root: SafeRoot,
  revision: string,
  options: SessionOptions,
): Promise<{ entry: HistoryEntry; snapshot: ProjectSnapshot; rawText: string }> {
  if (!isId(revision)) throw new ProjectFsError('INVALID_REVISION', 'Invalid revision ID.');
  const entry = await jsonRead(root, `${historyBase(revision)}.json`);
  validate(entry, options.projectId, revision);
  const bytes = await root.readFile(`${historyBase(revision)}.yaml`);
  if (byteHash(bytes) !== entry.sourceHash)
    throw new ProjectFsError('HISTORY_TAMPERED', 'History source hash does not match its metadata.');
  const snapshot = await snapshotBytes(bytes, options);
  if (snapshot.sourceRevision !== revision)
    throw new ProjectFsError('HISTORY_TAMPERED', 'History revision does not match its source.');
  return { entry, snapshot, rawText: bytes.toString('utf8') };
}
export async function historyList(root: SafeRoot, options: SessionOptions): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = [];
  for (const file of await listOrEmpty(root, '.robopomelo/history'))
    if (/^[a-f0-9]{64}\.json$/.test(file)) {
      const value = await jsonRead(root, `.robopomelo/history/${file}`);
      validate(value, options.projectId);
      if (file !== `${byteHash(value.sourceRevision)}.json`)
        throw new ProjectFsError('HISTORY_TAMPERED', 'History filename does not match its revision.');
      entries.push((await historyRead(root, value.sourceRevision, options)).entry);
    }
  return entries.sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.sourceRevision.localeCompare(b.sourceRevision),
  );
}
export async function writeInitialHistory(
  root: SafeRoot,
  sourceBytes: Uint8Array,
  metadata: { projectId: string; actor?: Actor },
): Promise<HistoryEntry> {
  const source = deploymentBytes(sourceBytes, metadata.projectId).deployment;
  const entry: HistoryEntry = {
    version: 1,
    projectId: metadata.projectId,
    sourceRevision: source.meta.revisionId,
    sourceHash: byteHash(sourceBytes),
    parentRevisionId: source.meta.parentRevisionId,
    parentSourceHash: null,
    timestamp: source.meta.updatedAt,
    origin: 'baseline',
    mutationId: null,
    digest: null,
    actor: metadata.actor ?? null,
    diff: [],
  };
  validate(entry, metadata.projectId);
  await directory(root, '.robopomelo');
  await directory(root, '.robopomelo/history');
  await immutable(root, `${historyBase(entry.sourceRevision)}.yaml`, sourceBytes);
  await jsonWrite(root, `${historyBase(entry.sourceRevision)}.json`, entry);
  await root.fsyncDirectory('.robopomelo/history');
  return entry;
}
export async function finalizeHistory(
  root: SafeRoot,
  journal: Journal,
  oldBytes: Buffer,
  newBytes: Buffer,
): Promise<void> {
  const before = deploymentBytes(oldBytes, journal.projectId).deployment;
  const after = deploymentBytes(newBytes, journal.projectId).deployment;
  const baseline: HistoryEntry = {
    version: 1,
    projectId: journal.projectId,
    ...journal.prior,
    parentRevisionId: before.meta.parentRevisionId,
    parentSourceHash: null,
    timestamp: before.meta.updatedAt,
    origin: 'baseline',
    mutationId: null,
    digest: null,
    actor: null,
    diff: [],
  };
  try {
    await root.stat(`${historyBase(baseline.sourceRevision)}.json`);
  } catch (error) {
    if (!missing(error)) throw error;
    await immutable(root, `${historyBase(baseline.sourceRevision)}.yaml`, oldBytes);
    await jsonWrite(root, `${historyBase(baseline.sourceRevision)}.json`, baseline);
  }
  const next: HistoryEntry = {
    version: 1,
    projectId: journal.projectId,
    ...journal.next,
    parentRevisionId: after.meta.parentRevisionId,
    parentSourceHash: journal.prior.sourceHash,
    timestamp: journal.createdAt,
    origin: journal.operation?.kind === 'reconcile' ? 'external' : 'commit',
    mutationId: journal.mutationId,
    digest: journal.digest,
    actor: journal.actor,
    diff: journal.diff,
  };
  await immutable(root, `${historyBase(next.sourceRevision)}.yaml`, newBytes);
  await jsonWrite(root, `${historyBase(next.sourceRevision)}.json`, next);
  await root.fsyncDirectory('.robopomelo/history');
}
