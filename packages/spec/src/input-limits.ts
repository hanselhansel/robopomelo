import type { ErrorObject } from 'ajv';

/** Every occurrence counts, including repeated references in noncyclic JS input. */
export const INPUT_LIMITS = { depth: 64, records: 10_000, nodes: 100_000 } as const;
type Limit = keyof typeof INPUT_LIMITS | 'cycle';
interface Frame {
  value: object;
  keys: string[];
  next: number;
  depth: number;
  path: string;
}
function failure(limit: Limit, instancePath: string): ErrorObject {
  return {
    keyword: 'inputLimit',
    instancePath,
    schemaPath: '#/inputLimits',
    params: { limit, ...(limit === 'cycle' ? {} : { maximum: INPUT_LIMITS[limit] }) },
    message:
      limit === 'cycle' ? 'must not contain cyclic references' : `must stay within the ${limit} input limit`,
  };
}
const pointer = (key: string): string => key.replace(/~/g, '~0').replace(/\//g, '~1');

/** Iterative traversal bounds work before Ajv's recursive generated validators run. */
export function checkInputLimits(input: unknown): ErrorObject | null {
  const active = new WeakSet<object>();
  const frames: Frame[] = [];
  let nodes = 0;
  let records = 0;
  function enter(value: unknown, path: string, depth: number): ErrorObject | null {
    if (++nodes > INPUT_LIMITS.nodes) return failure('nodes', path);
    if (value === null || typeof value !== 'object') return null;
    if (active.has(value)) return failure('cycle', path);
    if (depth > INPUT_LIMITS.depth) return failure('depth', path);
    if (!Array.isArray(value) && Object.hasOwn(value, 'id') && ++records > INPUT_LIMITS.records)
      return failure('records', path);
    // Sparse arrays still make Ajv visit every slot, including absent ones.
    if (Array.isArray(value) && value.length > INPUT_LIMITS.nodes - nodes) return failure('nodes', path);
    const keys = Object.keys(value);
    if (keys.length > INPUT_LIMITS.nodes - nodes) return failure('nodes', path);
    active.add(value);
    frames.push({ value, keys, next: 0, depth, path });
    return null;
  }
  const first = enter(input, '', 1);
  if (first) return first;
  while (frames.length) {
    const frame = frames[frames.length - 1]!;
    const key = frame.keys[frame.next++];
    if (key === undefined) {
      active.delete(frame.value);
      frames.pop();
      continue;
    }
    const error = enter(
      (frame.value as Record<string, unknown>)[key],
      `${frame.path}/${pointer(key)}`,
      frame.depth + 1,
    );
    if (error) return error;
  }
  return null;
}
