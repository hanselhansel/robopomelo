import { expect, it } from 'vitest';
import { checkSchema } from '@robopomelo/spec';
import { createBlankProject } from '../src/factory.js';
it('creates a portable schema-valid draft with no invented facts', () => {
  const draft=createBlankProject({id:'project-1',name:'Receiving',revision:'rev-1',timestamp:'2026-09-05T00:00:00Z'});
  expect(checkSchema(draft)).toEqual([]);
  expect(draft.project.problem).toBeNull();
  expect(draft.project.approverId).toBeNull();
  expect(draft.review.invalidations).toEqual([]);
  expect(draft.meta.revisionId).toBe('rev-1');
});
it('rejects invalid factory identity instead of producing malformed source', () => {
  expect(()=>createBlankProject({id:'../wrong',name:'Receiving',revision:'rev-1',timestamp:'2026-09-05T00:00:00Z'})).toThrow();
});
