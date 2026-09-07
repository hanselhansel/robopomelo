import { expect, it } from 'vitest';
import { xorshift32 } from '../../packages/simulation/src/prng.js';
it('reproduces the demand sequence for the same seed', () => {
  const a=xorshift32(7), b=xorshift32(7);
  expect(Array.from({length:100},a)).toEqual(Array.from({length:100},b));
});
it('rejects zero and out-of-range seeds instead of aliasing them', () => {
  for (const seed of [0,-1,1.5,0x100000000,NaN,Infinity])
    expect(() => xorshift32(seed)).toThrow('INVALID_SEED');
  const a=xorshift32(1), b=xorshift32(2);
  expect(Array.from({length:10},a)).not.toEqual(Array.from({length:10},b));
});
