import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateArtifacts } from '@robopomelo/artifacts';
import {
  ProjectService,
  RuntimeError,
  httpError,
  startApplication,
  type RunPolicy,
} from '@robopomelo/application';
import { ExportService } from '@robopomelo/project-fs';
import { afterEach, expect, it } from 'vitest';
import { startApplication as legacyStartApplication } from '../../apps/cli/src/server/application.js';
import { httpError as legacyHttpError } from '../../apps/cli/src/server/errors.js';
import { RuntimeError as LegacyRuntimeError } from '../../apps/cli/src/runtime/errors.js';
import type { RunPolicy as LegacyRunPolicy } from '../../apps/cli/src/runtime/selection.js';
import { ProjectService as LegacyProjectService } from '../../apps/cli/src/services/project.js';

const cleanup: string[] = [];

afterEach(async () => {
  for (const path of cleanup.splice(0).reverse()) await rm(path, { recursive: true, force: true });
});

function fixedIds() {
  let value = 0;
  return () => `shared-${++value}`;
}

async function exercise(Service: typeof ProjectService) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'rp-application-parity-')));
  cleanup.push(base);
  const projectPath = join(base, 'project');
  const service = new Service({
    toolVersion: 'parity-test',
    configDirectory: join(base, 'config'),
    clock: () => '2026-09-07T00:00:00.000Z',
    id: fixedIds(),
  });
  try {
    await service.create(projectPath, 'Receiving');
    await service.grant(['author', 'export'], 'autonomous', false);
    const before = await service.snapshot();
    const committed = await service.apply({
      formatVersion: '1.0.0',
      id: 'parity-change',
      projectId: before.deployment.project.id,
      baseRevision: before.sourceRevision,
      baseHash: before.sourceHash,
      actor: { kind: 'human', name: 'Parity engineer' },
      purpose: 'Preserve the shared service contract',
      operations: [
        {
          op: 'project',
          fields: { problem: { state: 'provided', value: 'The handoff owner is unclear.' } },
        },
      ],
    });
    expect(committed).toMatchObject({ kind: 'committed', alreadyApplied: false });
    const after = await service.snapshot();
    const exported = await service.withProject(async (selected) => {
      const session = service.requireSession(selected);
      const source = await selected.root.readFile('deployment.yaml');
      const plan = generateArtifacts({
        source: source.toString('utf8'),
        snapshot: after,
        selectedEvidenceIds: [],
      });
      const exports = new ExportService(session);
      const preview = await exports.preview(
        plan,
        { sourceRevision: after.sourceRevision, sourceHash: after.sourceHash },
        service.authorization(selected),
      );
      const result = await exports.persist(preview.previewId, {
        format: 'files',
        name: 'parity-export',
        authorization: service.authorization(selected),
      });
      return selected.root.readFile(`${result.path}/deployment.yaml`);
    });
    const source = await readFile(join(projectPath, 'deployment.yaml'));
    expect(exported).toEqual(source);
    return {
      validation: after.validation,
      committed,
      source: source.toString('utf8'),
      exported: exported.toString('utf8'),
    };
  } finally {
    await service.close();
  }
}

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
  const legacy = await exercise(LegacyProjectService);
  const shared = await exercise(ProjectService);
  expect(shared).toEqual(legacy);
  expect(shared.validation.findings).toEqual(legacy.validation.findings);
  expect(shared.source).toContain('value: The handoff owner is unclear.');
  expect(shared.exported).toBe(shared.source);
});

it('preserves runtime error classification and constructor identity', () => {
  const error = new LegacyRuntimeError('RUNTIME_UNAVAILABLE', 'Unavailable for parity test.');
  expect(error).toBeInstanceOf(RuntimeError);
  expect(legacyHttpError(error)).toEqual(httpError(error));
  expect(httpError(error)).toMatchObject({ status: 422, code: 'RUNTIME_UNAVAILABLE' });
});
