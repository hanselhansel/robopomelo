import { it, expect } from 'vitest';
import type { ProjectSnapshot, Finding } from '@robopomelo/spec';
import { snapshot as referenceSnapshot } from './reference.js';
import { findingTarget } from '../src/lib/navigation.js';
const d = referenceSnapshot.deployment;
const finding = (paths: string[], recordIds: string[] = []): Finding => ({
  ruleId: 'RP-020',
  ruleVersion: '1',
  severity: 'blocker',
  recordIds,
  paths,
  message: 'Missing field',
  nextAction: 'Supply it',
  waivable: false,
  fingerprint: 'x',
  status: 'active',
  acknowledged: false,
});
it('maps JSON pointer project fields to their actual controls', () => {
  expect(findingTarget(d, finding(['/project/approverId'], [d.project.id]))).toMatchObject({
    screen: 'frame',
    controlId: 'project-approverId-state',
  });
});
it('resolves an indexed flow field through the stable record ID', () => {
  expect(findingTarget(d, finding(['/workflows/0/origin'], [d.workflows[0]!.id]))).toMatchObject({
    screen: 'flow',
    recordId: d.workflows[0]!.id,
    controlId: `${d.workflows[0]!.id}-origin-state`,
  });
});
it('routes empty collection findings to their named Add action', () => {
  expect(findingTarget(d, finding(['/acceptanceTests']))).toMatchObject({
    screen: 'acceptance',
    controlId: 'add-acceptanceTests',
  });
});
