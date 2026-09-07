/** Explicit geometric unit conversion. Canonical units are meters, seconds and
 * radians. Unknown or vendor-specific units are refused, never guessed. */
export class UnitError extends Error {
  constructor(readonly code: 'UNIT_UNKNOWN' | 'UNIT_VALUE_INVALID', message: string) {
    super(message);
    this.name = 'UnitError';
  }
}
export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';
export type AngleUnit = 'deg' | 'rad';
export type SpeedUnit = 'm/s' | 'km/h' | 'ft/s' | 'cm/s';
export type AccelerationUnit = 'm/s^2' | 'cm/s^2' | 'ft/s^2';
export type AngularSpeedUnit = 'rad/s' | 'deg/s' | 'rpm';
const LENGTH: Record<LengthUnit, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };
const ANGLE: Record<AngleUnit, number> = { deg: Math.PI / 180, rad: 1 };
const SPEED: Record<SpeedUnit, number> = { 'm/s': 1, 'km/h': 1000 / 3600, 'ft/s': 0.3048, 'cm/s': 0.01 };
const ACCELERATION: Record<AccelerationUnit, number> = { 'm/s^2': 1, 'cm/s^2': 0.01, 'ft/s^2': 0.3048 };
const ANGULAR: Record<AngularSpeedUnit, number> = { 'rad/s': 1, 'deg/s': Math.PI / 180, rpm: (2 * Math.PI) / 60 };
function convert<U extends string>(table: Record<U, number>, kind: string, value: number, from: U, to: U): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new UnitError('UNIT_VALUE_INVALID', `${kind} value must be a finite number.`);
  const a = Object.hasOwn(table, from) ? table[from] : undefined;
  const b = Object.hasOwn(table, to) ? table[to] : undefined;
  if (a === undefined || b === undefined) throw new UnitError('UNIT_UNKNOWN', `Unsupported ${kind} unit. Supported: ${Object.keys(table).join(', ')}.`);
  return (value * a) / b;
}
export const convertLength = (value: number, from: LengthUnit, to: LengthUnit): number => convert(LENGTH, 'length', value, from, to);
export const convertAngle = (value: number, from: AngleUnit, to: AngleUnit): number => convert(ANGLE, 'angle', value, from, to);
export const convertSpeed = (value: number, from: SpeedUnit, to: SpeedUnit): number => convert(SPEED, 'speed', value, from, to);
export const convertAcceleration = (value: number, from: AccelerationUnit, to: AccelerationUnit): number => convert(ACCELERATION, 'acceleration', value, from, to);
export const convertAngularSpeed = (value: number, from: AngularSpeedUnit, to: AngularSpeedUnit): number => convert(ANGULAR, 'angular speed', value, from, to);
