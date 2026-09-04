import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ProjectFsError } from '../errors.js';
export const ATTACHMENT_LIMIT = 256 * 1024 * 1024;

/** Construct only from an explicit CLI argument or native file-picker selection. */
export class FileSelection {
  #closed = false;
  private constructor(
    private readonly handle: FileHandle,
    private readonly pinned: BigIntStats,
    readonly name: string,
  ) {}
  static async open(selectedPath: string): Promise<FileSelection> {
    const path = resolve(selectedPath),
      before = await lstat(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink())
      throw new ProjectFsError('SELECTION_UNREADABLE', 'Select a regular file, not a link or directory.');
    if (before.size > BigInt(ATTACHMENT_LIMIT))
      throw new ProjectFsError('LIMIT_EXCEEDED', 'Attachment exceeds the 256 MiB limit.');
    const handle = await open(
      path,
      constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW) | constants.O_NONBLOCK,
    );
    try {
      const after = await handle.stat({ bigint: true });
      if (after.dev !== before.dev || after.ino !== before.ino)
        throw new ProjectFsError('SELECTION_CHANGED', 'Selected file identity changed while opening.');
      return new FileSelection(handle, before, basename(path));
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  async #check(): Promise<void> {
    if (this.#closed) throw new ProjectFsError('SELECTION_CLOSED', 'Selected file handle is closed.');
    const stat = await this.handle.stat({ bigint: true });
    if (
      stat.dev !== this.pinned.dev ||
      stat.ino !== this.pinned.ino ||
      stat.size !== this.pinned.size ||
      stat.mtimeNs !== this.pinned.mtimeNs ||
      stat.ctimeNs !== this.pinned.ctimeNs
    )
      throw new ProjectFsError('SELECTION_CHANGED', 'Selected file changed. Select its current bytes again.');
  }
  async *stream(): AsyncGenerator<Uint8Array> {
    await this.#check();
    let position = 0;
    try {
      for (;;) {
        const buffer = Buffer.alloc(64 * 1024);
        const { bytesRead } = await this.handle.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        position += bytesRead;
        if (position > ATTACHMENT_LIMIT)
          throw new ProjectFsError('LIMIT_EXCEEDED', 'Attachment exceeds its limit.');
        yield buffer.subarray(0, bytesRead);
      }
    } finally {
      await this.#check();
    }
  }
  async inspect(): Promise<{ name: string; size: number; sha256: string }> {
    const hash = createHash('sha256');
    let size = 0;
    for await (const bytes of this.stream()) {
      size += bytes.byteLength;
      hash.update(bytes);
    }
    return { name: this.name, size, sha256: hash.digest('hex') };
  }
  async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      await this.handle.close();
    }
  }
}
