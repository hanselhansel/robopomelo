import { ProjectFsError } from '../errors.js';
import type { SafeRoot } from '../fs/safe-fs.js';
import { byteHash, digestValue } from './digest.js';
import { assertMetadata, closed } from './metadata.js';
export const missing = (error: unknown): boolean => (error as { code?: string }).code === 'ENOENT';
export const historyBase = (revision: string): string => `.robopomelo/history/${byteHash(revision)}`;
export const transactionBase = (id: string): string => `.robopomelo/recovery/${byteHash(id)}`;
export const proposalBase = (id: string): string => `.robopomelo/proposals/${byteHash(id)}`;
export async function directory(root: SafeRoot, path: string): Promise<void> {
  try {
    await root.mkdir(path);
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    if ((await root.stat(path)).kind !== 'directory') throw error;
  }
}
export async function layout(root: SafeRoot): Promise<void> {
  for (const path of ['.robopomelo', '.robopomelo/history', '.robopomelo/recovery', '.robopomelo/proposals'])
    await directory(root, path);
}
export async function immutable(root: SafeRoot, path: string, bytes: Uint8Array): Promise<void> {
  let handle;
  try {
    handle = await root.createExclusive(path);
  } catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') throw error;
    const previous = await root.readFile(path);
    if (!previous.equals(Buffer.from(bytes)))
      throw new ProjectFsError(
        'HISTORY_TAMPERED',
        'Immutable project storage conflicts with existing bytes.',
      );
    return;
  }
  try {
    await handle.write(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export function metadataBytes(value: unknown): Buffer {
  assertMetadata(value);
  const bytes = Buffer.from(JSON.stringify({ value, checksum: digestValue(value) }));
  if (bytes.length > 8 * 1024 * 1024)
    throw new ProjectFsError('LIMIT_EXCEEDED', 'Serialized recovery metadata exceeds the 8 MiB read limit.');
  return bytes;
}
export async function jsonWrite(root: SafeRoot, path: string, value: unknown): Promise<void> {
  await immutable(root, path, metadataBytes(value));
}
export async function jsonRead(root: SafeRoot, path: string): Promise<unknown> {
  let container: unknown;
  try {
    container = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await root.readFile(path)));
  } catch (error) {
    if (missing(error)) throw error;
    throw new ProjectFsError('STORAGE_INVALID', 'Project metadata is unreadable.');
  }
  assertMetadata(container);
  if (
    !closed(container, ['value', 'checksum']) ||
    !container ||
    typeof container !== 'object' ||
    !('value' in container) ||
    !('checksum' in container) ||
    typeof container.checksum !== 'string' ||
    digestValue(container.value) !== container.checksum
  )
    throw new ProjectFsError('STORAGE_INVALID', 'Project metadata checksum does not match.');
  return container.value;
}
export async function listOrEmpty(root: SafeRoot, path: string): Promise<string[]> {
  try {
    const entries = await root.list(path);
    if (entries.length > 10_000)
      throw new ProjectFsError('LIMIT_EXCEEDED', 'Project history exceeds the entry limit.');
    return entries;
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}
