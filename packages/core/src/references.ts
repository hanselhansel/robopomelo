import type { Deployment } from '@robopomelo/spec';
export interface ReferenceEntry {
  id: string;
  collection: string;
  path: string;
  record: Record<string, unknown>;
}
export function buildReferenceIndex(deployment: Deployment): Map<string, ReferenceEntry> {
  const index = new Map<string, ReferenceEntry>();
  function visit(value: unknown, collection: string, path: string): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, collection, `${path}/${i}`));
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') {
      if (index.has(record.id)) throw new Error(`Duplicate stable ID: ${record.id}`);
      index.set(record.id, { id: record.id, collection, path, record });
    }
    for (const [key, item] of Object.entries(record)) {
      if (key === 'extensions') continue;
      visit(item, collection, `${path}/${key}`);
    }
  }
  for (const [key, value] of Object.entries(deployment))
    if (key !== 'extensions' && key !== 'meta') visit(value, key, `/${key}`);
  return index;
}
