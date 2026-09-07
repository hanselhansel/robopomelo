// packages/simulation/src/prng.ts
export function xorshift32(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('INVALID_SEED');
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
