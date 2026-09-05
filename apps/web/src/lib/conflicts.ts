import type { Deployment, Json, PatchOperation } from '@robopomelo/spec';
import { applyLocal, operationsBetween } from './draft.js';
export interface ConflictItem {
  key: string;
  operation: PatchOperation;
  base: Json;
  current: Json;
  proposed: Json;
  conflicting: boolean;
  deleted: boolean;
}
export type Resolution = 'current' | 'proposed' | PatchOperation;
const asJson = (value: unknown): Json => (value ?? null) as Json;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function conflictItems(base: Deployment, current: Deployment, desired: Deployment): ConflictItem[] {
  return operationsBetween(base, desired).flatMap<ConflictItem>((operation) => {
    const row = (deployment: Deployment) =>
      operation.op === 'project'
        ? deployment.project
        : deployment[operation.collection].find(
            (r) => r.id === ('id' in operation ? operation.id : (operation.record as { id: string }).id),
          );
    const before = row(base),
      now = row(current),
      after = row(desired);
    if (operation.op === 'project' || operation.op === 'update')
      return Object.entries(operation.fields).map(([field, value]) => {
        const a = (before as unknown as Record<string, Json> | undefined)?.[field] ?? null;
        const b = (now as unknown as Record<string, Json> | undefined)?.[field] ?? null;
        return {
          key:
            operation.op === 'project'
              ? `project.${field}`
              : `${operation.collection}.${operation.id}.${field}`,
          operation: { ...operation, fields: { [field]: value } },
          base: a,
          current: b,
          proposed: value,
          conflicting: !same(a, b) && !same(b, value),
          deleted: !now,
        };
      });
    return [
      {
        key: `${operation.collection}.${'id' in operation ? operation.id : (operation.record as { id: string }).id}`,
        operation,
        base: asJson(before),
        current: asJson(now),
        proposed: asJson(after),
        conflicting: !same(before, now),
        deleted: !now && Boolean(before),
      },
    ];
  });
}
export function resolveItems(
  current: Deployment,
  items: ConflictItem[],
  choices: Record<string, Resolution>,
): Deployment {
  let result = structuredClone(current);
  const recreated = new Set<string>();
  for (const item of items) {
    const choice = choices[item.key] ?? (item.conflicting ? 'current' : 'proposed');
    if (choice === 'current') continue;
    const operation = choice === 'proposed' ? item.operation : choice;
    if (operation.op === 'add') {
      const id = (operation.record as { id: string }).id;
      if (recreated.has(id)) continue;
      recreated.add(id);
    }
    result = applyLocal(result, operation);
  }
  return result;
}
