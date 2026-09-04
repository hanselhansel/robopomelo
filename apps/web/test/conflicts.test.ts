import { it, expect } from 'vitest';
import { createBlankProject } from '@robopomelo/core';
import { conflictItems, resolveItems } from '../src/lib/conflicts.js';
it('retains independent local edits while resolving only competing fields', () => {
  const base = createBlankProject({
    id: 'p',
    name: 'Base',
    revision: 'r',
    timestamp: '2026-09-05T00:00:00Z',
  });
  const current = structuredClone(base);
  current.project.name = 'Remote name';
  current.project.exclusions = ['Remote exclusion'];
  const proposed = structuredClone(base);
  proposed.project.name = 'Local name';
  proposed.project.scope = { state: 'provided', value: 'Local scope' };
  const items = conflictItems(base, current, proposed);
  expect(items.filter((i) => i.conflicting)).toHaveLength(1);
  const resolved = resolveItems(current, items, { 'project.name': 'current' });
  expect(resolved.project.name).toBe('Remote name');
  expect(resolved.project.scope).toEqual(proposed.project.scope);
  expect(resolved.project.exclusions).toEqual(['Remote exclusion']);
});
