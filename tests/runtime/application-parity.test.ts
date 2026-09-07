import { readFile } from 'node:fs/promises';
import { exercise } from '../fixtures/application-parity/exercise.js';
import {
  ProjectService,
  RuntimeError,
  httpError,
  startApplication,
  type RunPolicy,
} from '@robopomelo/application';
import { expect, it } from 'vitest';
import { startApplication as legacyStartApplication } from '../../apps/cli/src/server/application.js';
import { httpError as legacyHttpError } from '../../apps/cli/src/server/errors.js';
import { RuntimeError as LegacyRuntimeError } from '../../apps/cli/src/runtime/errors.js';
import type { RunPolicy as LegacyRunPolicy } from '../../apps/cli/src/runtime/selection.js';
import { ProjectService as LegacyProjectService } from '../../apps/cli/src/services/project.js';

it('keeps the legacy CLI entry points as identity-preserving compatibility facades', () => {
  expect(LegacyProjectService).toBe(ProjectService);
  expect(legacyStartApplication).toBe(startApplication);
  expect(LegacyRuntimeError).toBe(RuntimeError);
  expect(legacyHttpError).toBe(httpError);

  const shared: RunPolicy = { offline: true, sourceCheckout: true };
  const legacy: LegacyRunPolicy = shared;
  expect(legacy).toEqual(shared);
});

it('preserves canonical source, validation, receipt and export behavior through the shared entry', async () => {
  const baseline = JSON.parse(
    await readFile(new URL('../fixtures/application-parity/baseline.json', import.meta.url), 'utf8'),
  );
  const shared = await exercise(ProjectService, startApplication);
  expect(shared).toEqual(baseline);
  expect(shared.source).toContain('value: The handoff owner is unclear.');
  expect(Buffer.from(shared.artifacts['deployment.yaml']!, 'base64').toString('utf8')).toBe(shared.source);
  expect(shared.members.map((member: { path: string }) => member.path)).toEqual([
    'acceptance-plan.md',
    'deployment-brief.md',
    'deployment.yaml',
    'engineering-handoff.md',
    'manifest.json',
    'review.html',
    'validation-report.json',
  ]);
});

it('preserves runtime error classification and constructor identity', () => {
  const error = new LegacyRuntimeError('RUNTIME_UNAVAILABLE', 'Unavailable for parity test.');
  expect(error).toBeInstanceOf(RuntimeError);
  expect(legacyHttpError(error)).toEqual(httpError(error));
  expect(httpError(error)).toMatchObject({ status: 422, code: 'RUNTIME_UNAVAILABLE' });
});
