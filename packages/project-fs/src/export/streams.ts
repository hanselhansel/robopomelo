import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ZipFile } from 'yazl';
import type { SafeRoot } from '../fs/safe-fs.js';
import { ProjectFsError } from '../errors.js';
import type { ExportOptions, FrozenExport, FrozenMember } from './contracts.js';
export function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new ProjectFsError('EXPORT_ABORTED', 'Export was cancelled. Incomplete output was retained.');
}
export async function* memberStream(
  root: SafeRoot,
  member: FrozenMember,
  options: ExportOptions,
): AsyncGenerator<Buffer> {
  cancelled(options.signal);
  if (member.kind === 'bytes') {
    for (let position = 0; position < member.bytes.length; position += 64 * 1024) {
      cancelled(options.signal);
      yield member.bytes.subarray(position, position + 64 * 1024);
    }
    await options.onProgress?.({ path: member.path, bytes: member.size });
    return;
  }
  const handle = await root.openRead(member.sourcePath);
  const hash = createHash('sha256');
  let size = 0;
  try {
    const before = await handle.stat();
    for (;;) {
      cancelled(options.signal);
      const chunk = await handle.readChunk();
      if (!chunk.length) break;
      size += chunk.length;
      if (size > member.size)
        throw new ProjectFsError('EVIDENCE_MISMATCH', 'Selected attachment grew while exporting.');
      hash.update(chunk);
      yield chunk;
    }
    const after = await handle.stat();
    if (
      size !== member.size ||
      hash.digest('hex') !== member.sha256 ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    )
      throw new ProjectFsError('EVIDENCE_MISMATCH', 'Selected attachment changed while exporting.');
    await options.onProgress?.({ path: member.path, bytes: size });
  } finally {
    await handle.close();
  }
}
export function zipStream(root: SafeRoot, plan: FrozenExport, options: ExportOptions): Readable {
  const zip = new ZipFile(),
    output = zip.outputStream as Readable;
  const active = new Set<Readable>();
  zip.on('error', (error) => output.destroy(error));
  output.once('close', () => {
    for (const stream of active) stream.destroy();
  });
  for (const member of plan.members)
    zip.addReadStreamLazy(
      member.path,
      {
        mtime: new Date(1980, 0, 1, 0, 0, 0),
        mode: 0o100644,
        compress: false,
        forceDosTimestamp: true,
        fileComment: '',
        size: member.size,
      },
      (callback) => {
        const stream = Readable.from(memberStream(root, member, options));
        active.add(stream);
        stream.once('error', (error) => output.destroy(error));
        stream.once('close', () => active.delete(stream));
        callback(null, stream);
      },
    );
  zip.end({ forceZip64Format: false, comment: '' });
  return output;
}
