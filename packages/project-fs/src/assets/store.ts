import { createHash } from 'node:crypto';
import { ProjectFsError } from '../errors.js';
import type { SafeRoot } from '../fs/safe-fs.js';
import { jsonRead, listOrEmpty, missing } from '../transactions/io.js';
import { closed, isHash } from '../transactions/metadata.js';
/** Content-addressed, immutable asset storage under assets/sha256/<digest>/.
 * Records are typed library members: they are not evidence and cannot be
 * replaced through an instance parameter edit. */
export const ASSET_BYTE_LIMIT = 25 * 1024 * 1024;
export const ASSET_TRIANGLE_LIMIT = 50_000;
export type AssetLicense = { spdx: string; source: string };
export type AssetManifest = {
  formatVersion: '1.0.0'; sha256: string; size: number; format: 'glb'; path: string; title: string; license: AssetLicense; triangles: number; meshes: number;
};
export const assetDirectory = (digest: string): string => `assets/sha256/${digest}`;
export const assetPath = (digest: string): string => `${assetDirectory(digest)}/original.glb`;
export const manifestPath = (digest: string): string => `${assetDirectory(digest)}/manifest.json`;
export const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export function assertDigest(digest: unknown): asserts digest is string {
  if (!isHash(digest)) throw new ProjectFsError('INVALID_DIGEST', 'An asset digest is 64 lowercase hex characters.');
}
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
export function parseLicense(value: unknown): AssetLicense {
  if (!closed(value, ['spdx', 'source']) || !text(value.spdx, 64) || !text(value.source, 512))
    throw new ProjectFsError('INVALID_ASSET_METADATA', 'Asset license needs an SPDX identifier and a reviewed source note.');
  return { spdx: value.spdx as string, source: value.source as string };
}
export function parseTitle(value: unknown): string {
  if (!text(value, 256)) throw new ProjectFsError('INVALID_ASSET_METADATA', 'Asset title must be 1 to 256 printable characters.');
  return value;
}
const count = (value: unknown, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;
/** Validates a stored manifest against the directory digest it lives under. */
export function parseManifest(value: unknown, digest: string): AssetManifest {
  const invalid = (): never => { throw new ProjectFsError('STORAGE_INVALID', `Asset manifest for ${digest} is malformed.`); };
  if (!closed(value, ['formatVersion', 'sha256', 'size', 'format', 'path', 'title', 'license', 'triangles', 'meshes'])) return invalid();
  if (value.formatVersion !== '1.0.0' || value.sha256 !== digest || value.format !== 'glb' || value.path !== assetPath(digest)) return invalid();
  if (!count(value.size, ASSET_BYTE_LIMIT) || !count(value.triangles, ASSET_TRIANGLE_LIMIT) || !count(value.meshes, ASSET_TRIANGLE_LIMIT)) return invalid();
  const title = text(value.title, 256) ? value.title : invalid();
  return { formatVersion: '1.0.0', sha256: digest, size: value.size, format: 'glb', path: assetPath(digest), title, license: parseLicense(value.license), triangles: value.triangles, meshes: value.meshes };
}
export class AssetStore {
  constructor(private readonly root: SafeRoot) {}
  async list(): Promise<AssetManifest[]> {
    const manifests: AssetManifest[] = [];
    for (const digest of await listOrEmpty(this.root, 'assets/sha256')) {
      if (!isHash(digest)) continue;
      let raw: unknown;
      try { raw = await jsonRead(this.root, manifestPath(digest)); } catch (error) { if (missing(error)) continue; throw error; }
      manifests.push(parseManifest(raw, digest));
    }
    return manifests;
  }
  async has(digest: string): Promise<boolean> {
    assertDigest(digest);
    try { return (await this.root.stat(assetPath(digest))).kind === 'file'; } catch (error) { if (missing(error)) return false; throw error; }
  }
  /** Returns original bytes only after recomputing and matching the digest. */
  async open(digest: string): Promise<Buffer> {
    assertDigest(digest);
    let bytes: Buffer;
    try { bytes = await this.root.readFile(assetPath(digest), ASSET_BYTE_LIMIT); }
    catch (error) { if (missing(error)) throw new ProjectFsError('ASSET_NOT_FOUND', `No asset is stored under ${digest}.`); throw error; }
    if (sha256Of(bytes) !== digest) throw new ProjectFsError('ASSET_HASH_MISMATCH', `Stored asset ${digest} no longer matches its digest.`);
    return bytes;
  }
}
