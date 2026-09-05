import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const digestJson = (value: unknown) => bytesToHex(sha256(new TextEncoder().encode(canonical(value))));
export async function hashFile(file: Blob, onProgress?: (bytes: number) => void): Promise<string> {
  const hash = sha256.create();
  const reader = file.stream().getReader();
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      hash.update(chunk.value);
      total += chunk.value.byteLength;
      onProgress?.(total);
    }
    return bytesToHex(hash.digest());
  } finally {
    reader.releaseLock();
  }
}
