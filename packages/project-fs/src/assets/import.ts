import { createHash, randomUUID } from 'node:crypto';
import { ProjectFsError } from '../errors.js';
import type { SafeRoot } from '../fs/safe-fs.js';
import { PROTOTYPE_KEYS } from '../limits.js';
import { directory, jsonWrite } from '../transactions/io.js';
import { ASSET_BYTE_LIMIT, ASSET_TRIANGLE_LIMIT, assetDirectory, assetPath, manifestPath, parseLicense, parseTitle, sha256Of, type AssetLicense, type AssetManifest } from './store.js';
export { ASSET_BYTE_LIMIT, ASSET_TRIANGLE_LIMIT, type AssetManifest } from './store.js';
/** Bounded import of static glTF 2.0 binary geometry. Only embedded, extension
 * free, unskinned, unanimated meshes are accepted; everything else is refused
 * before any byte is published. No asset resolver or script ever runs here. */
export type ImportAssetInput = { bytes: Uint8Array | AsyncIterable<Uint8Array>; declared: { sha256: string; size: number }; title: string; license: AssetLicense };
type Raw = Record<string, unknown>;
const fail = (code: string, message: string): never => { throw new ProjectFsError(code, message); };
const MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const isRecord = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);
const int = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;
const array = (value: unknown, what: string): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : fail('ASSET_FORMAT_INVALID', `glTF ${what} must be an array.`);
/** Rejects external references, prototype pollution and unbounded nesting anywhere in the document. */
function walk(value: unknown, depth = 0, budget = { nodes: 0 }): void {
  if (++budget.nodes > 500_000) fail('ASSET_TOO_COMPLEX', 'glTF document exceeds the node budget.');
  if (depth > 32) fail('ASSET_FORMAT_INVALID', 'glTF document nests too deeply.');
  if (Array.isArray(value)) { for (const item of value) walk(item, depth + 1, budget); return; }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (PROTOTYPE_KEYS.has(key)) fail('ASSET_FORMAT_INVALID', 'glTF document contains a prototype key.');
    if (key === 'uri') fail('ASSET_EXTERNAL_REFERENCE', 'Only embedded GLB geometry is supported; uri references are refused.');
    walk(item, depth + 1, budget);
  }
}
function header(bytes: Uint8Array): { json: Raw; binLength: number } {
  if (bytes.byteLength < 20 || bytes.byteLength % 4 !== 0) fail('ASSET_FORMAT_INVALID', 'GLB is truncated or unaligned.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== 2) fail('ASSET_FORMAT_INVALID', 'Only glTF 2.0 binary (GLB) files are supported.');
  if (view.getUint32(8, true) !== bytes.byteLength) fail('ASSET_FORMAT_INVALID', 'GLB header length does not match the file.');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || jsonLength % 4 !== 0 || 20 + jsonLength > bytes.byteLength) fail('ASSET_FORMAT_INVALID', 'GLB must start with an aligned JSON chunk.');
  let json: unknown;
  try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, 20 + jsonLength))); }
  catch { fail('ASSET_FORMAT_INVALID', 'GLB JSON chunk is malformed.'); }
  if (!isRecord(json)) return fail('ASSET_FORMAT_INVALID', 'GLB JSON chunk must be an object.');
  let binLength = 0, at = 20 + jsonLength;
  if (at < bytes.byteLength) {
    if (at + 8 > bytes.byteLength) fail('ASSET_FORMAT_INVALID', 'GLB binary chunk header is truncated.');
    binLength = view.getUint32(at, true);
    if (view.getUint32(at + 4, true) !== BIN_CHUNK || at + 8 + binLength !== bytes.byteLength) fail('ASSET_FORMAT_INVALID', 'GLB may contain only one JSON and one BIN chunk.');
  }
  return { json, binLength };
}
/** Static structural validation of the glTF document against the embedded buffer. */
export function inspectGlb(bytes: Uint8Array): { triangles: number; meshes: number } {
  const { json, binLength } = header(bytes);
  walk(json);
  if (!isRecord(json.asset) || json.asset.version !== '2.0') fail('ASSET_FORMAT_INVALID', 'glTF asset.version must be "2.0".');
  for (const key of ['extensionsUsed', 'extensionsRequired']) if (json[key] !== undefined && (!Array.isArray(json[key]) || (json[key] as unknown[]).length > 0)) fail('ASSET_UNSUPPORTED_EXTENSION', `glTF ${key} is not supported; import extension free geometry.`);
  for (const key of ['skins', 'animations']) if (json[key] !== undefined) fail('ASSET_UNSUPPORTED_FEATURE', `glTF ${key} are not supported for collision geometry.`);
  const buffers = array(json.buffers, 'buffers');
  if (buffers.length > 1) fail('ASSET_BUFFER_MISMATCH', 'GLB supports a single embedded buffer.');
  const bufferLength = buffers.length ? (isRecord(buffers[0]) && int(buffers[0].byteLength) ? buffers[0].byteLength : fail('ASSET_FORMAT_INVALID', 'glTF buffer needs a byteLength.')) : 0;
  if (bufferLength > binLength) fail('ASSET_BUFFER_MISMATCH', 'glTF buffer byteLength exceeds the embedded binary chunk.');
  const views = array(json.bufferViews, 'bufferViews').map((raw) => {
    if (!isRecord(raw) || raw.buffer !== 0 || !int(raw.byteLength) || !int(raw.byteOffset ?? 0) || !int(raw.byteStride ?? 0, 252)) return fail('ASSET_FORMAT_INVALID', 'glTF bufferView is malformed.');
    const byteOffset = (raw.byteOffset ?? 0) as number;
    if (byteOffset + raw.byteLength > bufferLength) fail('ASSET_BUFFER_MISMATCH', 'glTF bufferView extends beyond its buffer.');
    return { byteLength: raw.byteLength, byteStride: (raw.byteStride ?? 0) as number };
  });
  const accessors = array(json.accessors, 'accessors').map((raw) => {
    if (!isRecord(raw) || !int(raw.count) || !int(raw.byteOffset ?? 0)) return fail('ASSET_FORMAT_INVALID', 'glTF accessor is malformed.');
    const componentBytes = COMPONENT_BYTES[raw.componentType as number], components = TYPE_COUNT[raw.type as string];
    if (componentBytes === undefined || components === undefined) return fail('ASSET_FORMAT_INVALID', 'glTF accessor has an unsupported component layout.');
    if (raw.bufferView !== undefined) {
      const view = int(raw.bufferView) ? views[raw.bufferView] : undefined;
      if (!view) return fail('ASSET_BUFFER_MISMATCH', 'glTF accessor references a missing bufferView.');
      const element = componentBytes * components, stride = view.byteStride || element;
      const needed = raw.count === 0 ? 0 : ((raw.byteOffset ?? 0) as number) + stride * (raw.count - 1) + element;
      if (needed > view.byteLength) fail('ASSET_BUFFER_MISMATCH', 'glTF accessor reads beyond its bufferView.');
    }
    return { count: raw.count };
  });
  let triangles = 0;
  const meshes = array(json.meshes, 'meshes');
  for (const mesh of meshes) {
    if (!isRecord(mesh)) fail('ASSET_FORMAT_INVALID', 'glTF mesh is malformed.');
    for (const primitive of array((mesh as Raw).primitives, 'mesh.primitives')) {
      if (!isRecord(primitive) || !isRecord(primitive.attributes)) return fail('ASSET_FORMAT_INVALID', 'glTF primitive needs attributes.');
      const mode = primitive.mode ?? 4;
      if (mode !== 4 && mode !== 5 && mode !== 6) fail('ASSET_UNSUPPORTED_FEATURE', 'Only triangle primitives are supported for collision geometry.');
      const source = primitive.indices ?? primitive.attributes.POSITION;
      const accessor = int(source) ? accessors[source] : undefined;
      if (!accessor) return fail('ASSET_FORMAT_INVALID', 'glTF primitive references a missing accessor.');
      if (mode === 4 && accessor.count % 3 !== 0) fail('ASSET_FORMAT_INVALID', 'Triangle primitive vertex count is not a multiple of three.');
      triangles += mode === 4 ? accessor.count / 3 : Math.max(0, accessor.count - 2);
      if (triangles > ASSET_TRIANGLE_LIMIT) fail('ASSET_TOO_COMPLEX', `Model exceeds ${ASSET_TRIANGLE_LIMIT} triangles.`);
    }
  }
  return { triangles, meshes: meshes.length };
}
async function* chunksOf(bytes: Uint8Array | AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  if (bytes instanceof Uint8Array) yield bytes; else yield* bytes;
}
/** Stages through SafeRoot, verifies digest, size and structure, then publishes
 * without replacement. Any failure removes the staged part and publishes nothing. */
export async function importAsset(root: SafeRoot, input: ImportAssetInput): Promise<AssetManifest> {
  const declared = input.declared;
  if (!declared || typeof declared.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(declared.sha256)) fail('INVALID_DIGEST', 'Declare the SHA-256 of the asset bytes as 64 lowercase hex characters.');
  if (!int(declared.size, ASSET_BYTE_LIMIT)) fail('ASSET_TOO_LARGE', `Assets are limited to ${ASSET_BYTE_LIMIT} bytes.`);
  const title = parseTitle(input.title), license = parseLicense(input.license);
  for (const path of ['.robopomelo', '.robopomelo/recovery', '.robopomelo/recovery/assets']) await directory(root, path);
  const staged = `.robopomelo/recovery/assets/${randomUUID()}.part`;
  const handle = await root.createExclusive(staged), identity = await root.stat(staged);
  let complete = false, geometry: { triangles: number; meshes: number } = { triangles: 0, meshes: 0 };
  const hash = createHash('sha256'), parts: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const chunk of chunksOf(input.bytes)) {
      if (!(chunk instanceof Uint8Array)) fail('ASSET_FORMAT_INVALID', 'Asset chunks must contain bytes.');
      size += chunk.byteLength;
      if (size > declared.size) fail('ASSET_SIZE_MISMATCH', 'Asset bytes exceed the declared size.');
      hash.update(chunk); parts.push(chunk); await handle.write(chunk);
    }
    if (size !== declared.size) fail('ASSET_SIZE_MISMATCH', 'Asset bytes are shorter than the declared size.');
    if (hash.digest('hex') !== declared.sha256) fail('ASSET_HASH_MISMATCH', 'Asset bytes do not match the declared SHA-256.');
    geometry = inspectGlb(Buffer.concat(parts, size));
    await handle.sync();
    complete = true;
  } finally {
    await handle.close();
    if (!complete) await root.removeOwnedEntry(staged, identity);
  }
  const digest = declared.sha256, final = assetPath(digest);
  const manifest: AssetManifest = { formatVersion: '1.0.0', sha256: digest, size, format: 'glb', path: final, title, license, ...geometry };
  for (const path of ['assets', 'assets/sha256', assetDirectory(digest)]) await directory(root, path);
  try { await root.renameNoReplace(staged, final); }
  catch (error) {
    if ((error as { code?: string }).code !== 'EEXIST') { await root.removeOwnedEntry(staged, identity); throw error; }
    const existing = sha256Of(await root.readFile(final, ASSET_BYTE_LIMIT));
    await root.removeOwnedEntry(staged, identity);
    if (existing !== digest) fail('ASSET_CONFLICT', `Stored asset ${digest} differs from the imported bytes.`);
  }
  try { await jsonWrite(root, manifestPath(digest), manifest); }
  catch (error) { if ((error as { code?: string }).code === 'HISTORY_TAMPERED') fail('ASSET_CONFLICT', `Asset ${digest} is already recorded with different metadata.`); throw error; }
  await root.fsyncDirectory(assetDirectory(digest));
  return manifest;
}
