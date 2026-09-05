import { gzipSync } from 'node:zlib';
import tar from 'tar-stream';
export async function archive(
  entries: { name: string; body?: string; type?: tar.Header['type']; linkname?: string }[],
): Promise<Buffer> {
  const pack = tar.pack(),
    chunks: Buffer[] = [];
  pack.on('data', (c) => chunks.push(Buffer.from(c as Uint8Array)));
  const done = new Promise<Buffer>((resolve, reject) => {
    pack.on('end', () => resolve(gzipSync(Buffer.concat(chunks))));
    pack.on('error', reject);
  });
  for (const e of entries)
    pack.entry(
      { name: e.name, ...(e.type ? { type: e.type } : {}), ...(e.linkname ? { linkname: e.linkname } : {}) },
      e.body ?? '',
    );
  pack.finalize();
  return done;
}
