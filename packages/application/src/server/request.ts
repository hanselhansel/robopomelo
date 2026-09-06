import type { RouteContext } from './contracts.js';
import { HttpError } from './security.js';
export function requestBody(context: RouteContext): Record<string, unknown> {
  if (!context.body || typeof context.body !== 'object' || Array.isArray(context.body))
    throw new HttpError(400, 'INVALID_INPUT', 'Supply an object body.');
  return context.body as Record<string, unknown>;
}
export function requiredText(value: unknown, name: string, max = 4096): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new HttpError(400, 'INVALID_INPUT', `Supply a valid ${name}.`);
  return value;
}
export function expectedSource(value: unknown): { sourceRevision: string; sourceHash: string } {
  const object = value as { sourceRevision?: unknown; sourceHash?: unknown };
  return {
    sourceRevision: requiredText(object?.sourceRevision, 'source revision', 128),
    sourceHash: requiredText(object?.sourceHash, 'source hash', 64),
  };
}
export function mutationResult(value: unknown): unknown {
  if ((value as { kind?: string })?.kind === 'conflict')
    throw new HttpError(
      409,
      'STALE_BASE',
      'The source changed. Review the current and proposed values.',
      value,
    );
  return value;
}
