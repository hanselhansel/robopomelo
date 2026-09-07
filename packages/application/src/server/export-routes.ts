import { createHash } from 'node:crypto';
import { generateArtifacts } from '@robopomelo/artifacts';
import { ExportService, type ExportResult, type ProjectSession } from '@robopomelo/project-fs';
import { SPATIAL_NAMESPACE, checkSchema, type SpatialExtension } from '@robopomelo/spec';
import { bundledCatalog, SpatialError } from '@robopomelo/spatial';
import { buildIsaacExport, IsaacExportError, type IsaacExportPlan } from '@robopomelo/isaac-export';
import type { ProjectService, SelectedProject } from '../services/project.js';
import type { Route } from './contracts.js';
import { HttpError } from './security.js';
import { requestBody, expectedSource, requiredText } from './request.js';
import { waitForDrain } from './stream.js';
interface State {
  exports: ExportService;
  previews: Map<string, { sourceRevision: string; sourceHash: string }>;
  completed: Map<string, ExportResult>;
}
/** Optional Isaac reference package. The scene and scenario are named explicitly;
 * the package states its own unsupported scope and never implies a validated run. */
function isaacMembers(
  value: unknown,
  snapshot: { deployment: { project: { id: string; name: string }; extensions: Record<string, unknown> } },
  expected: { sourceRevision: string; sourceHash: string },
): { plan: IsaacExportPlan; members: { path: string; mediaType: string; bytes: Uint8Array }[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'INVALID_INPUT', 'Supply the Isaac scene and scenario.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['sceneId', 'scenarioId', 'runId'].includes(key))) throw new HttpError(400, 'INVALID_INPUT', 'Unexpected Isaac export fields.');
  const sceneId = requiredText(body.sceneId, 'scene', 128), scenarioId = requiredText(body.scenarioId, 'scenario', 128);
  const raw = snapshot.deployment.extensions[SPATIAL_NAMESPACE];
  if (!raw || checkSchema(raw, 'spatial').length) throw new HttpError(422, 'UNSUPPORTED_CAPABILITY', 'This project has no valid spatial extension to export.');
  try {
    return buildIsaacExport({
      spatial: raw as SpatialExtension, sceneId, scenarioId, catalog: bundledCatalog(),
      source: { ...expected, projectId: snapshot.deployment.project.id, projectName: snapshot.deployment.project.name },
      run: null, generatedAt: '1970-01-01T00:00:00.000Z',
    });
  } catch (error) {
    if (error instanceof IsaacExportError || error instanceof SpatialError) throw new HttpError(error.code === 'RECORD_NOT_FOUND' ? 404 : 422, error.code, error.message);
    throw error;
  }
}
export function exportRoutes(service: ProjectService): Route[] {
  const states = new WeakMap<ProjectSession, State>();
  function state(project: SelectedProject) {
    const session = service.requireSession(project);
    let value = states.get(session);
    if (!value) {
      value = { exports: new ExportService(session), previews: new Map(), completed: new Map() };
      states.set(session, value);
    }
    return value;
  }
  return [
    {
      method: 'POST',
      path: '/api/export/preview',
      handler: (context) =>
        service.withProject(async (project) => {
          const body = requestBody(context),
            expected = expectedSource(body.expected);
          if (
            !Array.isArray(body.selectedEvidenceIds) ||
            body.selectedEvidenceIds.some((id) => typeof id !== 'string')
          )
            throw new HttpError(400, 'INVALID_INPUT', 'Select evidence IDs explicitly.');
          const read = await service.requireSession(project).open();
          if (read.kind !== 'readable')
            throw new HttpError(422, 'SOURCE_UNREADABLE', 'Fix the source before exporting.');
          if (
            read.snapshot.sourceHash !== expected.sourceHash ||
            read.snapshot.sourceRevision !== expected.sourceRevision
          )
            throw new HttpError(409, 'STALE_BASE', 'Refresh before previewing this export.');
          const source = (await project.root.readFile('deployment.yaml')).toString('utf8');
          const isaac = body.isaac === undefined ? null : isaacMembers(body.isaac, read.snapshot, expected);
          const plan = generateArtifacts({
            source,
            snapshot: read.snapshot,
            selectedEvidenceIds: body.selectedEvidenceIds as string[],
            ...(isaac ? { extraMembers: isaac.members } : {}),
          });
          const value = state(project),
            preview = await value.exports.preview(plan, expected, service.authorization(project));
          if (value.previews.size >= 16) {
            const oldest = value.previews.keys().next().value!;
            value.previews.delete(oldest);
            value.completed.delete(oldest);
          }
          value.previews.set(preview.previewId, expected);
          return isaac ? { ...preview, isaac: { mode: isaac.plan.mode, runnableBadge: isaac.plan.runnableBadge, remainingSetup: isaac.plan.remainingSetup, unsupported: isaac.plan.unsupported } } : preview;
        }),
    },
    {
      method: 'POST',
      path: '/api/export',
      handler: (context) =>
        service.withProject(async (project) => {
          const body = requestBody(context),
            id = requiredText(body.previewId, 'export preview ID', 128),
            expected = expectedSource(body.expected),
            value = state(project),
            bound = value.previews.get(id);
          if (
            !bound ||
            bound.sourceHash !== expected.sourceHash ||
            bound.sourceRevision !== expected.sourceRevision
          )
            throw new HttpError(
              409,
              'EXPORT_PREVIEW_EXPIRED',
              'Preview the exact source and evidence selection again.',
            );
          let completed = value.completed.get(id);
          if (!completed) {
            completed = await value.exports.persist(id, {
              format: 'zip',
              authorization: service.authorization(project),
            });
            value.completed.set(id, completed);
          }
          const handle = await project.root.openRead(completed.path);
          try {
            context.response.setHeader('Content-Type', 'application/zip');
            context.response.setHeader('Content-Disposition', 'attachment; filename="robopomelo-review.zip"');
            const hash = createHash('sha256');
            let count = 0;
            while (true) {
              const bytes = await handle.readChunk();
              if (!bytes.length) break;
              count += bytes.length;
              hash.update(bytes);
              if (!context.response.write(bytes)) await waitForDrain(context.response);
            }
            if (count !== completed.bytes || hash.digest('hex') !== completed.sha256)
              throw new HttpError(
                409,
                'EXPORT_CHANGED',
                'The stored export changed before download completed.',
              );
            context.response.end();
          } finally {
            await handle.close();
          }
        }),
    },
  ];
}
