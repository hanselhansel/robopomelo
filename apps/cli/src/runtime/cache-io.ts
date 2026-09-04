import { createHash } from 'node:crypto';
import type { SafeRoot } from '../../../../packages/project-fs/src/fs/safe-fs.js';
import type { PayloadDigest, RuntimeManifest } from './contracts.js';
import { RuntimeError } from './errors.js';
export async function* fileBytes(root: SafeRoot, path: string): AsyncGenerator<Uint8Array> {
  const handle = await root.openRead(path);
  try {
    while (true) {
      const chunk = await handle.readChunk();
      if (!chunk.length) return;
      yield chunk;
    }
  } finally {
    await handle.close();
  }
}
export async function hashFile(
  root: SafeRoot,
  path: string,
  limit = 64 * 1024 * 1024,
): Promise<PayloadDigest> {
  const a = createHash('sha256'),
    b = createHash('sha512');
  let bytes = 0;
  for await (const chunk of fileBytes(root, path)) {
    bytes += chunk.byteLength;
    if (bytes > limit) throw new RuntimeError('RUNTIME_CORRUPT', 'Cached runtime exceeds its size limit.');
    a.update(chunk);
    b.update(chunk);
  }
  return { sha256: a.digest('hex'), sha512: b.digest('hex') };
}
export async function writeJson(root: SafeRoot, path: string, value: unknown): Promise<void> {
  const file = await root.createExclusive(path);
  try {
    await file.write(Buffer.from(JSON.stringify(value) + '\n'));
    await file.sync();
  } finally {
    await file.close();
  }
}
export async function readJson(root: SafeRoot, path: string): Promise<unknown> {
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(await root.readFile(path, 2 * 1024 * 1024)),
  );
}
export async function validatePayloadFiles(root: SafeRoot, manifest: RuntimeManifest): Promise<void> {
  const actual: string[] = [];
  async function list(prefix = ''): Promise<void> {
    for (const name of await root.list(prefix || undefined)) {
      const path = prefix ? `${prefix}/${name}` : name;
      const stat = await root.stat(path);
      if (stat.kind === 'directory') await list(path);
      else actual.push(path);
    }
  }
  await list();
  const expected = ['runtime-manifest.json', ...manifest.files.map((f) => f.path)].sort();
  if (actual.sort().join('\n') !== expected.join('\n'))
    throw new RuntimeError('RUNTIME_CORRUPT', 'Runtime file inventory differs from the verified manifest.');
  for (const file of manifest.files) {
    const stat = await root.stat(file.path);
    if (stat.size !== file.size || (await hashFile(root, file.path)).sha256 !== file.sha256)
      throw new RuntimeError('RUNTIME_CORRUPT', 'Runtime file integrity check failed.', { file: file.path });
  }
  const pkg = (await readJson(root, 'package.json')) as { name?: string; version?: string };
  if (pkg.name !== 'robopomelo' || pkg.version !== manifest.version)
    throw new RuntimeError('RUNTIME_CORRUPT', 'Package and manifest identities differ.');
}
