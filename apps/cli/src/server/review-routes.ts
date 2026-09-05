import { checkSchema, type ReviewCommand, type Actor, type PatchEnvelope } from '@robopomelo/spec';
import { evaluateRestore } from '@robopomelo/core';
import { semanticDiff } from '../../../../packages/core/src/diff.js';
import type { ProjectService } from '../services/project.js';
import type { Route } from './contracts.js';
import { HttpError } from './security.js';
import { requestBody, requiredText, expectedSource, mutationResult } from './request.js';
export function reviewRoutes(service: ProjectService): Route[] {
  return [
    {
      method: 'POST',
      path: '/api/patch/check',
      handler: (context) => {
        const patch = requestBody(context).patch as PatchEnvelope;
        if (checkSchema(patch, 'patch').length)
          throw new HttpError(422, 'INVALID_SCHEMA', 'Patch structure is invalid.');
        return service.withProject((project) =>
          service.requireSession(project).preview({
            expected: { sourceRevision: patch.baseRevision, sourceHash: patch.baseHash },
            idempotencyKey: patch.id,
            authorization: service.authorization(project),
            actor: patch.actor,
            mutation: { kind: 'patch', patch },
          }),
        );
      },
    },
    {
      method: 'POST',
      path: '/api/review',
      handler: async (context) => {
        const command = requestBody(context).command as ReviewCommand;
        if (checkSchema(command, 'review').length)
          throw new HttpError(422, 'INVALID_SCHEMA', 'Review command structure is invalid.');
        return mutationResult(await service.review(command));
      },
    },
    {
      method: 'GET',
      path: '/api/changes/:id',
      handler: (context) =>
        service.withProject((project) =>
          service
            .requireSession(project)
            .mutationStatus(
              context.params.id!,
              requiredText(context.url.searchParams.get('digest'), 'receipt digest', 64),
            ),
        ),
    },
    {
      method: 'GET',
      path: '/api/history/:revision',
      handler: (context) =>
        service.withProject((project) =>
          service.requireSession(project).historyRead(context.params.revision!),
        ),
    },
    {
      method: 'GET',
      path: '/api/history/:revision/restore-preview',
      handler: (context) =>
        service.withProject(async (project) => {
          const session = service.requireSession(project),
            read = await session.open();
          if (read.kind !== 'readable')
            throw new HttpError(422, 'SOURCE_UNREADABLE', 'Fix the source before restoration.');
          const snapshot = read.snapshot,
            target = (await session.historyRead(context.params.revision!)).snapshot.deployment;
          const expected = { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash };
          const candidate = { ...target, meta: snapshot.deployment.meta, review: snapshot.deployment.review };
          const diff = semanticDiff(snapshot.deployment, candidate);
          try {
            const evaluation = evaluateRestore(
              snapshot.deployment,
              target,
              {
                id: service.id(),
                projectId: project.projectId!,
                baseRevision: expected.sourceRevision,
                baseHash: expected.sourceHash,
                actor: { kind: 'human', name: 'Local restore preview' },
                purpose: 'Preview authoring restoration',
              },
              {
                sourceRevision: expected.sourceRevision,
                sourceHash: expected.sourceHash,
                toolVersion: service.options.toolVersion,
                evidence: snapshot.evidenceObservations,
                scopes: project.writeGrant?.scopes ?? ['inspect'],
                nextRevision: service.id(),
                timestamp: service.clock(),
              },
            );
            return { expected, diff, validation: evaluation.validation };
          } catch (error) {
            return {
              expected,
              diff,
              blockedBy: [
                {
                  code: (error as { code?: string }).code ?? 'RESTORE_BLOCKED',
                  message: error instanceof Error ? error.message : 'Restore is not currently permitted.',
                },
              ],
            };
          }
        }),
    },
    {
      method: 'POST',
      path: '/api/history/:revision/restore',
      handler: async (context) => {
        const body = requestBody(context);
        return mutationResult(
          await service.restore(
            context.params.revision!,
            expectedSource(body.expected),
            body.actor as Actor,
            requiredText(body.purpose, 'restore reason'),
            body.id === undefined ? service.id() : requiredText(body.id, 'mutation ID', 128),
          ),
        );
      },
    },
    {
      method: 'GET',
      path: '/api/proposals',
      handler: () =>
        service.withProject(async (project) =>
          (await service.requireSession(project).proposalList()).map((proposal) => {
            const mutation = proposal.effectiveMutation,
              command = mutation.kind === 'patch' ? mutation.patch : mutation.review;
            return {
              id: proposal.proposalId,
              mutation,
              ...(mutation.kind === 'patch' ? { patch: mutation.patch } : {}),
              purpose: command.purpose,
              actor: command.actor,
              baseRevision: proposal.request.expected.sourceRevision,
              baseHash: proposal.request.expected.sourceHash,
              status: proposal.status,
              patchDigest: proposal.digest,
              receiptDigest: proposal.requestDigest,
              diff: proposal.diff,
            };
          }),
        ),
    },
    {
      method: 'POST',
      path: '/api/proposals/:id/apply',
      handler: (context) => {
        const body = requestBody(context);
        return service.withProject(async (project) =>
          mutationResult(
            await service.requireSession(project).applyStoredProposal(context.params.id!, {
              expected: expectedSource(body.expected),
              authorization: service.authorization(project),
              approvedPatchDigest: requiredText(body.approvedPatchDigest, 'proposal digest', 64),
            }),
          ),
        );
      },
    },
    {
      method: 'POST',
      path: '/api/project/reconcile',
      handler: (context) => {
        const body = requestBody(context);
        return service.withProject(async (project) =>
          mutationResult(
            await service
              .requireSession(project)
              .reconcileExternal(
                requiredText(body.expectedHash, 'source hash', 64),
                body.actor as Actor,
                service.authorization(project),
              ),
          ),
        );
      },
    },
    {
      method: 'POST',
      path: '/api/recovery/:id/retire',
      handler: (context) => {
        const body = requestBody(context);
        return service.withProject((project) =>
          service
            .requireSession(project)
            .retirePrepared(context.params.id!, requiredText(body.digest, 'receipt digest', 64), {
              authorization: service.authorization(project),
              actor: body.actor as Actor,
              reason: requiredText(body.reason, 'retirement reason'),
            }),
        );
      },
    },
  ];
}
