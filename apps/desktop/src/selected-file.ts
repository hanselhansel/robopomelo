import { lstat, realpath } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { SafeRoot } from '@robopomelo/project-fs';
import { assertAttachmentBatch, DEFAULT_INGESTION_LIMITS, IngestionError } from '@robopomelo/ingestion';

/** Main-process token only. Copying metadata does not copy selection authority. */
export interface SelectedFile {
  readonly displayName: string;
  readonly byteLength: number;
}
type RootIdentity = ReturnType<SafeRoot['identity']>;
interface SelectionIdentity {
  canonicalPath: string;
  leaf: string;
  root: RootIdentity;
  fingerprint: string;
}
const selections = new WeakMap<SelectedFile, SelectionIdentity>();
export class SelectedFileError extends Error {
  constructor(readonly code: 'ATTACHMENT_SELECTION_UNAVAILABLE' | 'ATTACHMENT_SELECTION_CHANGED') {
    super('The selected file is unavailable or changed. Select the file again.');
    this.name = 'SelectedFileError';
  }
}
const changed = () => new SelectedFileError('ATTACHMENT_SELECTION_CHANGED');
const fingerprint = (stat: BigIntStats): string =>
  [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
function regular(stat: BigIntStats): void {
  if (!stat.isFile() || stat.isSymbolicLink()) throw changed();
}
function sameRoot(a: RootIdentity, b: RootIdentity): boolean {
  return a.canonicalPath === b.canonicalPath && a.device === b.device && a.fileId === b.fileId;
}
function sanitized(error: unknown, isRead: boolean): Error {
  if (error instanceof IngestionError || error instanceof SelectedFileError) return error;
  return new SelectedFileError(isRead ? 'ATTACHMENT_SELECTION_CHANGED' : 'ATTACHMENT_SELECTION_UNAVAILABLE');
}

/** Native chooser authority covers one explicit file. The selected parent is
 * canonicalized solely to pin its identity, never exposed as directory authority.
 * Like SafeRoot, this is portable checked I/O, not kernel-enforced confinement
 * against an unrestricted same-user process racing ancestor replacements. */
export async function snapshotSelectedFile(path: string): Promise<SelectedFile> {
  let root: SafeRoot | undefined;
  try {
    if (
      !isAbsolute(path) ||
      path.includes('\0') ||
      path.split(/[\\/]/).some((part) => part === '..' || part === '.')
    )
      throw new SelectedFileError('ATTACHMENT_SELECTION_UNAVAILABLE');
    const parent = await realpath(dirname(path));
    const leaf = basename(path);
    root = await SafeRoot.open(parent);
    const canonicalPath = join(parent, leaf);
    const before = await lstat(canonicalPath, { bigint: true });
    regular(before);
    assertAttachmentBatch([{ byteLength: Number(before.size) }]);
    const checked = await root.stat(leaf);
    if (checked.device !== String(before.dev) || checked.fileId !== String(before.ino)) throw changed();
    const after = await lstat(canonicalPath, { bigint: true });
    regular(after);
    if (fingerprint(before) !== fingerprint(after)) throw changed();
    const selection = Object.freeze({ displayName: leaf, byteLength: Number(before.size) });
    selections.set(selection, {
      canonicalPath,
      leaf,
      root: root.identity(),
      fingerprint: fingerprint(before),
    });
    return selection;
  } catch (error) {
    throw sanitized(error, false);
  } finally {
    await root?.close().catch(() => undefined);
  }
}

export async function readSelectedFile(selection: SelectedFile): Promise<Uint8Array> {
  let root: SafeRoot | undefined;
  try {
    const pinned = selections.get(selection);
    if (!pinned) throw new SelectedFileError('ATTACHMENT_SELECTION_UNAVAILABLE');
    root = await SafeRoot.open(pinned.root.canonicalPath);
    if (!sameRoot(root.identity(), pinned.root)) throw changed();
    const checkFingerprint = async () => {
      const stat = await lstat(pinned.canonicalPath, { bigint: true });
      regular(stat);
      if (fingerprint(stat) !== pinned.fingerprint) throw changed();
    };
    await checkFingerprint();
    const handle = await root.openRead(pinned.leaf);
    try {
      // Recheck after opening and after reading: inode identity alone misses
      // same-inode edits. SafeRoot also checks its pinned root around each chunk.
      await checkFingerprint();
      const opened = await handle.stat();
      const checked = await root.stat(pinned.leaf);
      if (opened.device !== checked.device || opened.fileId !== checked.fileId) throw changed();
      const bytes = await handle.readFile(DEFAULT_INGESTION_LIMITS.maxFileBytes);
      await checkFingerprint();
      const after = await root.stat(pinned.leaf);
      if (
        after.device !== opened.device ||
        after.fileId !== opened.fileId ||
        bytes.byteLength !== selection.byteLength
      )
        throw changed();
      return bytes;
    } finally {
      await handle.close();
    }
  } catch (error) {
    throw sanitized(error, true);
  } finally {
    await root?.close().catch(() => undefined);
  }
}
