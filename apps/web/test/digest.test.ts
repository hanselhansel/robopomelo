import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { digestJson, hashFile } from '../src/lib/digest.js';
it('hashes canonical objects without rearranging array order', () => {
  expect(digestJson({ z: [2, 1], a: { b: 2, a: 1 } })).toBe(
    createHash('sha256').update('{"a":{"a":1,"b":2},"z":[2,1]}').digest('hex'),
  );
});
it('streams file bytes into the same SHA-256 as Node', async () => {
  const bytes = new Uint8Array(200000).fill(71);
  expect(await hashFile(new Blob([bytes]))).toBe(createHash('sha256').update(bytes).digest('hex'));
});
