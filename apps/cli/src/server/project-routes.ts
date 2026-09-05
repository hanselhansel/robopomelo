import {
  checkSchema,
  fields,
  workflows,
  questions,
  capabilities,
  type PatchEnvelope,
  type Scope,
} from '@robopomelo/spec';
import { sourceIdentity } from './source-identity.js';
import { reviewDocument, traceability } from '@robopomelo/core';
import type { ProjectService } from '../services/project.js';
import type { Route } from './contracts.js';
import { HttpError } from './security.js';
import { requestBody, requiredText, mutationResult } from './request.js';
export function projectRoutes(service: ProjectService, onStatus: () => void): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/workflow',
      projectScoped: false,
      handler: async () => ({ fields, workflows, questions, capabilities }),
    },
    {
      method: 'POST',
      path: '/api/projects/create',
      projectScoped: false,
      handler: async (context) => {
        const body = requestBody(context);
        if (body.example !== undefined && body.example !== 'inbound-pallet')
          throw new HttpError(400, 'INVALID_INPUT', 'Choose the supported example.');
        await service.create(
          requiredText(body.path, 'project folder'),
          requiredText(body.name, 'project name', 200),
          body.example === 'inbound-pallet',
        );
        onStatus();
        return service.status();
      },
    },
    {
      method: 'POST',
      path: '/api/projects/open',
      projectScoped: false,
      handler: async (context) => {
        await service.open(
          requiredText(requestBody(context).path, 'project folder'),
          [],
          context.projectEpoch,
        );
        onStatus();
        return service.status();
      },
    },
    { method: 'GET', path: '/api/project', handler: () => service.read() },
    {
      method: 'GET',
      path: '/api/project/source-identity',
      handler: (context) => sourceIdentity(service, context.projectEpoch),
    },
    { method: 'GET', path: '/api/validate', handler: async () => (await service.snapshot()).validation },
    {
      method: 'GET',
      path: '/api/project/review',
      handler: async () => {
        const snapshot = await service.snapshot();
        return reviewDocument(snapshot.deployment, snapshot.validation);
      },
    },
    {
      method: 'GET',
      path: '/api/project/traceability',
      handler: async () => traceability((await service.snapshot()).deployment),
    },
    {
      method: 'POST',
      path: '/api/patch/apply',
      handler: async (context) => {
        const body = requestBody(context),
          patch = body.patch as PatchEnvelope;
        if (checkSchema(patch, 'patch').length)
          throw new HttpError(422, 'INVALID_SCHEMA', 'Patch structure is invalid.');
        return mutationResult(
          await service.apply(
            patch,
            body.supersedesProposalId === undefined
              ? undefined
              : requiredText(body.supersedesProposalId, 'proposal ID', 128),
          ),
        );
      },
    },
    {
      method: 'GET',
      path: '/api/history',
      handler: () => service.withProject((project) => service.requireSession(project).historyList()),
    },
    {
      method: 'GET',
      path: '/api/trust',
      handler: () =>
        service.withProject(async (project) => ({
          root: project.root.identity().canonicalPath,
          grant: project.writeGrant,
          effectiveScopes: service.status().scopes,
          mode: project.writeGrant?.mode ?? 'autonomous',
        })),
    },
    {
      method: 'POST',
      path: '/api/trust',
      handler: async (context) => {
        const body = requestBody(context);
        if (body.action === 'grant') {
          if (
            !Array.isArray(body.scopes) ||
            body.scopes.some((value) => typeof value !== 'string') ||
            typeof body.remember !== 'boolean' ||
            !['autonomous', 'review-each-change'].includes(String(body.mode))
          )
            throw new HttpError(400, 'INVALID_INPUT', 'Supply explicit scopes, mode and remember choice.');
          await service.grant(
            body.scopes as Scope[],
            body.mode as 'autonomous' | 'review-each-change',
            body.remember,
          );
        } else if (body.action === 'forget') await service.forget();
        else if (body.action === 'revoke') await service.revoke();
        else throw new HttpError(400, 'INVALID_INPUT', 'Choose grant, revoke or forget.');
        onStatus();
        return service.status();
      },
    },
  ];
}
