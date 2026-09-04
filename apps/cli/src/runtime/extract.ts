import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import tar from 'tar-stream';
import { SafeRoot } from '../../../../packages/project-fs/src/fs/safe-fs.js';
import { portableNameKey, projectRelativePath } from '../../../../packages/project-fs/src/fs/paths.js';
import { RuntimeError } from './errors.js';
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
/** Inert streamed extraction. Only regular package files and directories are admitted. */
export async function extractRuntime(
  source: Uint8Array | AsyncIterable<Uint8Array>,
  directory: string,
  limits: Partial<ExtractionLimits> = {},
): Promise<void> {
  const bound = { ...defaults, ...limits };
  const root = await SafeRoot.open(directory),
    extract = tar.extract(),
    names = new Set<string>(),
    directories = new Set<string>();
  let entries = 0;
  async function mkdir(path: string): Promise<void> {
    let part = '';
    for (const segment of path.split('/')) {
      part = part ? `${part}/${segment}` : segment;
      if (!directories.has(part)) {
        try {
          await root.mkdir(part);
        } catch (e) {
          if ((e as { code?: string }).code !== 'EEXIST') throw e;
        }
        directories.add(part);
      }
    }
  }
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
      if (name === 'package') {
        if (header.type !== 'directory')
          throw new RuntimeError('ARCHIVE_PATH', 'Package root must be a directory.');
        stream.resume();
        return;
      }
      const path = projectRelativePath(name.slice(8)),
        key = portableNameKey(path);
      if (names.has(key))
        throw new RuntimeError('ARCHIVE_COLLISION', 'Duplicate or case-colliding archive path.');
      names.add(key);
      if (header.type === 'directory') {
        if (header.size !== 0)
          throw new RuntimeError('ARCHIVE_ENTRY', 'Directory entries cannot carry data.');
        await mkdir(path);
        stream.resume();
        return;
      }
      const segments = path.split('/');
      segments.pop();
      if (segments.length) await mkdir(segments.join('/'));
      const file = await root.createExclusive(path);
      let size = 0;
      try {
        for await (const raw of stream) {
          if (!(raw instanceof Uint8Array)) throw new RuntimeError('ARCHIVE_ENTRY', 'Invalid archive data.');
          const chunk = Buffer.from(raw);
          size += chunk.length;
          if (size > bound.maxFileBytes)
            throw new RuntimeError('ARCHIVE_LIMIT', 'Runtime file exceeds limits.');
          await file.write(chunk);
        }
        if (size !== header.size) throw new RuntimeError('ARCHIVE_ENTRY', 'Truncated runtime file.');
        await file.sync();
      } finally {
        await file.close();
      }
    })().then(
      () => next(),
      (error) => extract.destroy(error as Error),
    );
  });
  try {
    const input = source instanceof Uint8Array ? Readable.from([source]) : Readable.from(source);
    await pipeline(
      input,
      limiter(bound.maxCompressedBytes),
      createGunzip(),
      limiter(bound.maxExpandedBytes),
      extract,
      { signal: AbortSignal.timeout(bound.timeoutMs) },
    );
    await root.fsyncDirectory();
  } finally {
    await root.close();
  }
}
