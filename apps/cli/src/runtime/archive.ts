import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import tar from 'tar-stream';
import { portableNameKey, projectRelativePath } from '../../../../packages/project-fs/src/fs/paths.js';
import { RuntimeError } from './errors.js';
import type { RuntimeFile } from './contracts.js';
export interface ExtractionLimits {
  maxCompressedBytes: number;
  maxExpandedBytes: number;
  maxFileBytes: number;
  maxEntries: number;
  timeoutMs: number;
}
const defaults: ExtractionLimits = {
  maxCompressedBytes: 64 * 1024 * 1024,
  maxExpandedBytes: 256 * 1024 * 1024,
  maxFileBytes: 64 * 1024 * 1024,
  maxEntries: 10000,
  timeoutMs: 30000,
};
function limiter(max: number): Transform {
  let count = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      count += chunk.length;
      if (count > max) done(new RuntimeError('ARCHIVE_LIMIT', 'Runtime archive exceeds its byte limit.'));
      else done(null, chunk);
    },
  });
}
export type ArchiveSource = Uint8Array | AsyncIterable<Uint8Array>;
export interface ArchiveEntry {
  path: string;
  type: 'file' | 'directory';
  size: number;
  bytes: AsyncIterable<Uint8Array>;
}
export async function walkRuntimeArchive(
  source: ArchiveSource,
  visit: (entry: ArchiveEntry) => Promise<void>,
  limits: Partial<ExtractionLimits> = {},
): Promise<void> {
  const bound = { ...defaults, ...limits },
    extract = tar.extract(),
    names = new Set<string>();
  let entries = 0;
  extract.on('entry', (header, stream, next) => {
    void (async () => {
      if (
        ++entries > bound.maxEntries ||
        !Number.isSafeInteger(header.size) ||
        Number(header.size) < 0 ||
        Number(header.size) > bound.maxFileBytes
      )
        throw new RuntimeError('ARCHIVE_LIMIT', 'Runtime archive entry exceeds limits.');
      if (header.type !== 'file' && header.type !== 'directory')
        throw new RuntimeError('ARCHIVE_ENTRY', 'Links and special archive entries are forbidden.');
      if (header.linkname || Object.keys(header.pax ?? {}).some((k) => /sparse/i.test(k)))
        throw new RuntimeError('ARCHIVE_ENTRY', 'Linked or sparse archive entries are forbidden.');
      const name = header.name.endsWith('/') ? header.name.slice(0, -1) : header.name;
      if (!name.startsWith('package/') && name !== 'package')
        throw new RuntimeError('ARCHIVE_PATH', 'Runtime archive paths must be under package/.');
      const path = name === 'package' ? '' : projectRelativePath(name.slice(8)),
        key = portableNameKey(path || 'package');
      if (names.has(key))
        throw new RuntimeError('ARCHIVE_COLLISION', 'Duplicate or case-colliding archive path.');
      names.add(key);
      if (header.type === 'directory' && header.size !== 0)
        throw new RuntimeError('ARCHIVE_ENTRY', 'Directory entries cannot carry data.');
      if (!path) {
        if (header.type !== 'directory')
          throw new RuntimeError('ARCHIVE_PATH', 'Package root must be a directory.');
        stream.resume();
        return;
      }
      let size = 0;
      async function* bytes() {
        for await (const raw of stream) {
          if (!(raw instanceof Uint8Array)) throw new RuntimeError('ARCHIVE_ENTRY', 'Invalid archive data.');
          size += raw.byteLength;
          if (size > bound.maxFileBytes)
            throw new RuntimeError('ARCHIVE_LIMIT', 'Runtime file exceeds limits.');
          yield raw;
        }
        if (size !== header.size) throw new RuntimeError('ARCHIVE_ENTRY', 'Truncated runtime file.');
      }
      await visit({ path, type: header.type, size: Number(header.size), bytes: bytes() });
    })().then(
      () => next(),
      (error) => extract.destroy(error as Error),
    );
  });
  const input = source instanceof Uint8Array ? Readable.from([source]) : Readable.from(source);
  await pipeline(
    input,
    limiter(bound.maxCompressedBytes),
    createGunzip(),
    limiter(bound.maxExpandedBytes),
    extract,
    { signal: AbortSignal.timeout(bound.timeoutMs) },
  );
}
export async function inspectRuntimeArchive(
  source: ArchiveSource,
): Promise<{ manifestBytes: Buffer; files: RuntimeFile[] }> {
  const files: RuntimeFile[] = [];
  let manifestBytes: Buffer | null = null;
  await walkRuntimeArchive(source, async (entry) => {
    const hash = createHash('sha256'),
      chunks: Buffer[] = [];
    for await (const chunk of entry.bytes) {
      hash.update(chunk);
      if (entry.path === 'runtime-manifest.json') {
        if (entry.size > 1024 * 1024) throw new RuntimeError('ARCHIVE_LIMIT', 'Manifest is too large.');
        chunks.push(Buffer.from(chunk));
      }
    }
    if (entry.type === 'directory') return;
    if (entry.path === 'runtime-manifest.json') manifestBytes = Buffer.concat(chunks);
    else files.push({ path: entry.path, size: entry.size, sha256: hash.digest('hex') });
  });
  if (!manifestBytes)
    throw new RuntimeError('RUNTIME_MANIFEST_INVALID', 'Verified payload has no runtime manifest.');
  return { manifestBytes, files };
}
