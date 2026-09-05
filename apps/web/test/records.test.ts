import { it, expect } from 'vitest';
import { checkSchema } from '@robopomelo/spec';
import type { Collection } from '@robopomelo/spec';
import { createBlankProject } from '@robopomelo/core';
import { newRecord, collectionLabels } from '../src/lib/records.js';
it('creates all thirteen record variants without structural placeholders or lost containers', () => {
  for (const collection of Object.keys(collectionLabels) as Collection[]) {
    const d = createBlankProject({ id: 'p', name: 'Plan', revision: 'r', timestamp: '2026-09-05T00:00:00Z' });
    const record = newRecord(collection);
    if (collection === 'challengeAnswers' && 'promptId' in record) record.promptId = 'problem-owner';
    (d[collection] as unknown[]).push(record);
    expect(checkSchema(d), collection).toEqual([]);
  }
});
