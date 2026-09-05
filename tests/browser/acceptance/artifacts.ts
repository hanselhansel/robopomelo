import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { ProjectSnapshot, ValidationReport } from '@robopomelo/spec';
const exec = promisify(execFile);
export async function cli<T = ProjectSnapshot>(command: string, project: string): Promise<T> {
  const { stdout } = await exec(
    process.execPath,
    [resolve('dist/package/bin/robopomelo.mjs'), command, '--project', project, '--json', '--offline'],
    {
      env: {
        ...process.env,
        ROBOPOMELO_CONFIG_DIR: join(dirname(project), 'config'),
        ROBOPOMELO_CACHE_DIR: join(dirname(project), 'cache'),
      },
    },
  );
  const result = JSON.parse(stdout);
  if (!result.ok) throw new Error(stdout);
  return result.data as T;
}
export const validate = (project: string) => cli<ValidationReport>('validate', project);
/** Inspect the ZIP central directory and decode actual member bytes, including data-descriptor ZIPs. */
export function zipMembers(zip: Buffer): Map<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('ZIP end record missing');
  const entries = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const members = new Map<string, Buffer>();
  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid central directory');
    const method = zip.readUInt16LE(cursor + 10);
    const size = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString();
    const local = zip.readUInt32LE(cursor + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const compressed = zip.subarray(start, start + size);
    if (![0, 8].includes(method) || members.has(name)) throw new Error('Unsupported or duplicate ZIP member');
    members.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    cursor += 46 + nameLength + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
  }
  return members;
}
