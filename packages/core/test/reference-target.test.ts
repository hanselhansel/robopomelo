import { it, expect } from 'vitest';
import { buildReferenceIndex } from '../src/references.js';
import { isReferenceTarget } from '../src/reference-checks.js';
import { populated } from '../../spec/test/fixtures.js';
import type { Deployment } from '@robopomelo/spec';
it('shares exact reference choices for acceptance subjects and verification support', () => {
  const d: Deployment = structuredClone(populated);
  d.workflows[0]!.mode = 'current';
  const index = buildReferenceIndex(d);
  expect(isReferenceTarget(index, 'flow', 'subjectIds', '/acceptanceTests/0/subjectIds')).toBe(false);
  expect(
    isReferenceTarget(
      index,
      'evidence',
      'evidenceRequirementIds',
      '/acceptanceTests/0/evidenceRequirementIds',
    ),
  ).toBe(true);
  expect(isReferenceTarget(index, 'evidence', 'evidenceIds', '/needs/0/verification/0/evidenceIds')).toBe(
    false,
  );
});
