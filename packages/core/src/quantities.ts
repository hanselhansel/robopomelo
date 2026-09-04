import type { Quantity } from '@robopomelo/spec';
import { findUnit } from '@robopomelo/spec';
export interface Fraction { numerator: bigint; denominator: bigint }
function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
  return a;
}
export function decimalToFraction(value: string): Fraction {
  if (typeof value !== 'string' || value.length > 128 || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('Invalid bounded decimal');
  const [whole = '', fraction = ''] = value.split('.');
  const numerator = BigInt(whole + fraction);
  const denominator = 10n ** BigInt(fraction.length);
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}
export function compareQuantities(a: Quantity, b: Quantity): -1 | 0 | 1 {
  const ua = findUnit(a.unit), ub = findUnit(b.unit);
  if (!ua || !ub) throw new Error('Unsupported unit');
  if (ua.dimension !== ub.dimension) throw new Error('Incompatible dimension');
  if (!a.subject.trim() || a.subject !== b.subject) throw new Error('Incompatible subject');
  const x = decimalToFraction(a.value), y = decimalToFraction(b.value);
  const left = x.numerator * BigInt(ua.numerator) * y.denominator * BigInt(ub.denominator);
  const right = y.numerator * BigInt(ub.numerator) * x.denominator * BigInt(ua.denominator);
  return left < right ? -1 : left > right ? 1 : 0;
}
