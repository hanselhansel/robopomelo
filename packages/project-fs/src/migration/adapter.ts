import type { Deployment, Json, Actor, Scope } from '@robopomelo/spec';
import { checkSchema } from '@robopomelo/spec';
import { isDeepStrictEqual } from 'node:util';
import { evaluateRestore } from '../../../core/src/restore.js';
import { ProjectFsError } from '../errors.js';
import type { SessionOptions } from '../contracts.js';
import { observations } from '../transactions/snapshot.js';
import { sourceHeader } from './backup.js';
import { serializeCandidate } from '../transactions/ast.js';
import { parseSource } from '../yaml/parse.js';
export interface MigrationAdapter {
  from: string;
  to: string;
  validateSource: (value: unknown) => boolean;
  transform: (value: Record<string, Json>) => Record<string, Json> | Promise<Record<string, Json>>;
  validateTarget: (value: unknown) => boolean;
}
export interface MigrationPlan {
  from: string;
  to: string;
  sourceHash: string;
  sourceRevision: string;
  nextRevision: string;
  timestamp: string;
  sourceBytes: Buffer;
  candidate: Record<string, Json>;
  adapter: MigrationAdapter;
}
function extensions(value: unknown, map = new Map<string, unknown>(), path = '$root'): Map<string, unknown> {
  if (!value || typeof value !== 'object') return map;
  if (Array.isArray(value)) {
    value.forEach((item, index) => extensions(item, map, `${path}/${index}`));
    return map;
  }
  const v = value as Record<string, unknown>,
    identity = typeof v.id === 'string' ? `id:${v.id}` : path;
  if (Object.hasOwn(v, 'extensions')) map.set(identity, v.extensions);
  for (const [key, item] of Object.entries(v))
    if (key !== 'extensions') extensions(item, map, `${identity}/${key}`);
  return map;
}
export async function planMigration(
  options: SessionOptions,
  adapter: MigrationAdapter,
  bytes: Buffer,
): Promise<MigrationPlan> {
  const header = sourceHeader(bytes, options.projectId);
  if (!adapter.validateSource(header.value))
    throw new ProjectFsError('MIGRATION_INVALID', 'Registered adapter rejected the source schema.');
  const candidate = await adapter.transform(structuredClone(header.value));
  if (!adapter.validateTarget(candidate) || candidate.specVersion !== adapter.to)
    throw new ProjectFsError('MIGRATION_INVALID', 'Registered adapter produced an invalid target.');
  parseSource(serializeCandidate(header.source, candidate));
  const priorExtensions = extensions(header.value),
    nextExtensions = extensions(candidate);
  for (const [id, value] of priorExtensions)
    if (!isDeepStrictEqual(value, nextExtensions.get(id)))
      throw new ProjectFsError('MIGRATION_INVALID', 'Migration cannot discard preserved extension payloads.');
  if (!isDeepStrictEqual(header.value.review, candidate.review))
    throw new ProjectFsError('MIGRATION_INVALID', 'Adapters cannot rewrite the human review ledger.');
  if (
    checkSchema({ ...header.value, specVersion: '1.0.0' }).length ||
    checkSchema({ ...candidate, specVersion: '1.0.0' }).length
  )
    throw new ProjectFsError(
      'UNSUPPORTED_MIGRATION',
      'This runtime cannot safely interpret the common authoring contract for this adapter.',
    );
  return {
    from: adapter.from,
    to: adapter.to,
    sourceHash: header.sourceHash,
    sourceRevision: header.sourceRevision,
    nextRevision: options.id(),
    timestamp: options.clock(),
    sourceBytes: bytes,
    candidate,
    adapter,
  };
}
export async function evaluateMigration(
  options: SessionOptions,
  plan: MigrationPlan,
  actor: Actor,
  scopes: Scope[],
): Promise<Buffer> {
  const header = sourceHeader(plan.sourceBytes, options.projectId),
    current = { ...header.value, specVersion: '1.0.0' } as unknown as Deployment,
    target = { ...plan.candidate, specVersion: '1.0.0' } as unknown as Deployment;
  const context = {
    sourceRevision: plan.sourceRevision,
    sourceHash: plan.sourceHash,
    toolVersion: options.toolVersion,
    scopes,
    nextRevision: plan.nextRevision,
    timestamp: plan.timestamp,
    evidence: await observations(current, options),
  };
  const evaluated = evaluateRestore(
    current,
    target,
    {
      id: plan.nextRevision,
      projectId: options.projectId,
      baseRevision: plan.sourceRevision,
      baseHash: plan.sourceHash,
      actor,
      purpose: `Migrate specification ${plan.from} to ${plan.to}`,
    },
    context,
  );
  const output = { ...evaluated.deployment, specVersion: plan.to } as unknown as Record<string, Json>;
  if (!plan.adapter.validateTarget(output))
    throw new ProjectFsError(
      'MIGRATION_INVALID',
      'Target validation failed after protected migration bookkeeping.',
    );
  return Buffer.from(serializeCandidate(header.source, output));
}
