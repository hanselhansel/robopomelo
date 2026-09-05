import { it, expect } from 'vitest';
import { evaluatePatch } from '../src/patches.js';
import { complete, approved } from './validation-fixtures.test.js';
import { mutationContext, patch } from './mutation-fixtures.js';
it('persists an earlier observed material invalidation even when current bytes return to the approved content', () => {
  const d = approved(complete());
  const c = {
    ...mutationContext(),
    observedApprovalInvalidations: [{ approvalId: 'approval', reason: 'planning-content-changed' as const }],
  };
  const result = evaluatePatch(d, patch([]), c);
  expect(result.deployment.review.invalidations).toHaveLength(1);
  expect(result.deployment.review.invalidations[0]?.approvalId).toBe('approval');
  expect(d.review.invalidations).toEqual([]);
});
it('does not apply an observed invalidation to another selected decision', () => {
  const d = approved(complete());
  const c = {
    ...mutationContext(),
    observedApprovalInvalidations: [{ approvalId: 'different', reason: 'planning-content-changed' as const }],
  };
  expect(evaluatePatch(d, patch([]), c).deployment.review.invalidations).toEqual([]);
});
