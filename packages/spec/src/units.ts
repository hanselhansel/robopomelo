export interface UnitDefinition {
  readonly id: string;
  readonly dimension: 'length' | 'mass' | 'duration' | 'count' | 'rate' | 'ratio' | 'speed';
  readonly numerator: string;
  readonly denominator: string;
}
const values: readonly [string, UnitDefinition['dimension'], string, string][] = [
  ['mm', 'length', '1', '1000'],
  ['cm', 'length', '1', '100'],
  ['m', 'length', '1', '1'],
  ['in', 'length', '127', '5000'],
  ['ft', 'length', '381', '1250'],
  ['g', 'mass', '1', '1000'],
  ['kg', 'mass', '1', '1'],
  ['lb', 'mass', '45359237', '100000000'],
  ['ms', 'duration', '1', '1000'],
  ['s', 'duration', '1', '1'],
  ['min', 'duration', '60', '1'],
  ['h', 'duration', '3600', '1'],
  ['count', 'count', '1', '1'],
  ['count/min', 'rate', '1', '60'],
  ['count/h', 'rate', '1', '3600'],
  ['ratio', 'ratio', '1', '1'],
  ['%', 'ratio', '1', '100'],
  ['m/s', 'speed', '1', '1'],
  ['ft/s', 'speed', '381', '1250'],
];
export const units: readonly UnitDefinition[] = Object.freeze(
  values.map(([id, dimension, numerator, denominator]) =>
    Object.freeze({ id, dimension, numerator, denominator }),
  ),
);
export function findUnit(id: string): UnitDefinition | undefined {
  return units.find((unit) => unit.id === id);
}
