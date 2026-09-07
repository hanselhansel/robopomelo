import { capabilities, checkSchema, SPATIAL_NAMESPACE, type PatchEnvelope, type SpatialAction, type SpatialExtension } from '@robopomelo/spec';
import { bundledCatalog, compileScene, SpatialError } from '@robopomelo/spatial';
import { DomainError } from '@robopomelo/core';
import type { ProjectService } from '../services/project.js';
import type { Route } from './contracts.js';
import { HttpError } from './security.js';
import { requestBody, requiredText, expectedSource, mutationResult } from './request.js';
const ID = /^[A-Za-z0-9][A-Za-z0-9.:_-]{0,127}$/;
const ACTION_LIMIT = 200;
function spatialOf(deployment: { extensions: Record<string, unknown> }): SpatialExtension | null {
  const raw = deployment.extensions[SPATIAL_NAMESPACE];
  return raw && !checkSchema(raw, 'spatial').length ? (raw as SpatialExtension) : null;
}
/** Scene, capability and catalog routes. Every write is a checked SpatialEnvelope
 * turned into an ordinary patch, so it inherits base identity, idempotency,
 * author authority and conflict retention from the transaction path. */
export function spatialRoutes(service: ProjectService): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/capabilities',
      handler: async () => {
        const snapshot = await service.snapshot();
        const required = (snapshot.deployment.extensions['robopomelo.capabilities'] as { required?: unknown } | undefined)?.required;
        return {
          activated: Array.isArray(required) ? required.filter((id): id is string => typeof id === 'string') : [],
          available: capabilities.filter((capability) => capability.available && capability.stage !== 'removed').map(({ id, kind, stage, specRange, enabledByDefault }) => ({ id, kind, stage, specRange, enabledByDefault })),
        };
      },
    },
    {
      method: 'GET',
      path: '/api/catalog',
      projectScoped: false,
      handler: async () => {
        const catalog = bundledCatalog();
        return { formatVersion: catalog.formatVersion, entries: catalog.entries.map(({ id, version, kind, title, description, parameterSchema, display, license, sha256, robot }) => ({ id, version, kind, title, description, parameterSchema, display, license, sha256, ...(robot ? { robot } : {}) })) };
      },
    },
    {
      method: 'GET',
      path: '/api/scenes',
      handler: async () => {
        const spatial = spatialOf((await service.snapshot()).deployment);
        return { scenes: (spatial?.scenes ?? []).map(({ id, name, floor, instances }) => ({ id, name, floor, instanceCount: instances.length })), scenarios: spatial?.scenarios ?? [], robotProfiles: spatial?.robotProfiles ?? [], assets: spatial?.assets ?? [] };
      },
    },
    {
      method: 'GET',
      path: '/api/scenes/:id',
      handler: async (context) => {
        const id = requiredText(context.params.id, 'scene', 128);
        const snapshot = await service.snapshot();
        const spatial = spatialOf(snapshot.deployment);
        const scene = spatial?.scenes.find((row) => row.id === id);
        if (!scene) throw new HttpError(404, 'RECORD_NOT_FOUND', 'That scene does not exist in this project.');
        try {
          return { scene, compiled: compileScene(scene, bundledCatalog()), bindings: spatial!.bindings.filter((b) => spatial!.scenarios.some((s) => s.id === b.target.scenarioId && s.sceneId === id)), sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash };
        } catch (error) {
          if (error instanceof SpatialError) throw new HttpError(422, error.code, error.message);
          throw error;
        }
      },
    },
    {
      method: 'POST',
      path: '/api/scenes/actions',
      handler: async (context) => {
        const body = requestBody(context);
        if (Object.keys(body).sort().join(',') !== 'actions,mutationId,purpose,sourceHash,sourceRevision') throw new HttpError(400, 'INVALID_INPUT', 'Supply a spatial envelope.');
        const expected = expectedSource(body);
        const mutationId = requiredText(body.mutationId, 'mutation ID', 128);
        if (!ID.test(mutationId)) throw new HttpError(400, 'INVALID_INPUT', 'Supply a valid mutation ID.');
        const purpose = requiredText(body.purpose, 'purpose', 500);
        if (!Array.isArray(body.actions) || !body.actions.length || body.actions.length > ACTION_LIMIT) throw new HttpError(400, 'INVALID_INPUT', `Supply between 1 and ${ACTION_LIMIT} actions.`);
        const snapshot = await service.snapshot();
        const patch: PatchEnvelope = {
          formatVersion: '1.0.0', id: mutationId, projectId: snapshot.deployment.project.id, baseRevision: expected.sourceRevision, baseHash: expected.sourceHash,
          actor: { kind: 'human', name: 'Local project author' }, purpose, operations: (body.actions as SpatialAction[]).map((action) => ({ op: 'spatial', action })),
        };
        const problems = checkSchema(patch, 'patch');
        if (problems.length) throw new HttpError(422, 'INVALID_SCHEMA', 'One or more spatial actions are malformed.', problems.slice(0, 20) as never);
        try {
          return mutationResult(await service.apply(patch));
        } catch (error) {
          if (error instanceof DomainError) throw new HttpError(422, error.code, error.message);
          throw error;
        }
      },
    },
  ];
}
