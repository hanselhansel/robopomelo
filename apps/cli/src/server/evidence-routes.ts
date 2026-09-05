import { createHash } from 'node:crypto';
import { waitForDrain } from './stream.js';
import { basename } from 'node:path';
import type { Actor, Evidence } from '@robopomelo/spec';
import {
  EvidenceService,
  type EvidenceInput,
  type EvidenceMetadata,
} from '../../../../packages/project-fs/src/evidence/service.js';
import type { ProjectSession } from '../../../../packages/project-fs/src/session.js';
import type { ProjectService, SelectedProject } from '../services/project.js';
import type { Route, RouteContext } from './contracts.js';
import { HttpError } from './security.js';
import { requestBody, requiredText, expectedSource, mutationResult } from './request.js';
export function evidenceRoutes(service: ProjectService): Route[] {
  const services = new WeakMap<ProjectSession, EvidenceService>();
  function forProject(project: SelectedProject) {
    const session = service.requireSession(project);
    let value = services.get(session);
    if (!value) {
      value = new EvidenceService(session);
      services.set(session, value);
    }
    return value;
  }
  function input(context: RouteContext, project: SelectedProject): EvidenceInput {
    const body = requestBody(context);
    const metadata: EvidenceMetadata = {
      title: requiredText(body.title, 'evidence title', 200),
      purpose: body.purpose as Evidence['purpose'],
      provenance: body.provenance as Evidence['provenance'],
      relatedIds: body.relatedIds as string[],
      ...(typeof body.required === 'boolean' ? { required: body.required } : {}),
    };
    return {
      expected: expectedSource(body.expected),
      mutationId: requiredText(body.mutationId, 'mutation ID', 128),
      authorization: service.authorization(project),
      actor: (body.actor ?? { kind: 'human', name: 'Local browser author' }) as Actor,
      metadata,
    };
  }
  return [
    {
      method: 'GET',
      path: '/api/evidence',
      handler: () =>
        service.withProject(async (project) => {
          const read = await service.requireSession(project).open();
          if (read.kind !== 'readable')
            throw new HttpError(422, 'SOURCE_UNREADABLE', 'Fix the source before inspecting evidence.');
          return {
            records: read.snapshot.deployment.evidence,
            observations: read.snapshot.evidenceObservations,
          };
        }),
    },
    {
      method: 'POST',
      path: '/api/evidence/check',
      handler: () =>
        service.withProject(async (project) => ({ observations: await forProject(project).observe() })),
    },
    {
      method: 'POST',
      path: '/api/evidence/prepare',
      handler: (context) =>
        service.withProject(async (project) => {
          const evidenceInput = input(context, project);
          const prepared = await forProject(project).prepare({
            ...evidenceInput,
            selected: requestBody(context).file as { name: string; size: number; sha256: string },
          });
          return {
            uploadId: prepared.uploadId,
            mutationId: evidenceInput.mutationId,
            digest: prepared.receiptDigest,
          };
        }),
    },
    {
      method: 'PUT',
      path: '/api/evidence/uploads/:id',
      rawBody: true,
      handler: (context) => {
        if (context.request.headers['content-type']?.split(';')[0] !== 'application/octet-stream')
          throw new HttpError(415, 'CONTENT_TYPE', 'Upload the selected bytes as application/octet-stream.');
        return service.withProject(async (project) =>
          mutationResult(await forProject(project).accept(context.params.id!, context.request)),
        );
      },
    },
    {
      method: 'POST',
      path: '/api/evidence/reference',
      handler: (context) =>
        service.withProject(async (project) =>
          mutationResult(
            await forProject(project).reference(
              input(context, project),
              requestBody(context).location as Extract<Evidence['location'], { kind: 'external' | 'future' }>,
            ),
          ),
        ),
    },
    {
      method: 'POST',
      path: '/api/evidence/:id/remove',
      handler: (context) =>
        service.withProject(async (project) => {
          const body = requestBody(context);
          const evidenceInput: EvidenceInput = {
            expected: expectedSource(body.expected),
            mutationId: typeof body.mutationId === 'string' ? body.mutationId : service.id(),
            authorization: service.authorization(project),
            actor: (body.actor ?? { kind: 'human', name: 'Local browser author' }) as Actor,
            metadata: {
              title: typeof body.purpose === 'string' ? body.purpose : 'Remove evidence reference',
              purpose: 'planning',
              provenance: null,
              relatedIds: [],
            },
          };
          return mutationResult(await forProject(project).remove(context.params.id!, evidenceInput));
        }),
    },
    {
      method: 'GET',
      path: '/api/evidence/:id/download',
      handler: (context) =>
        service.withProject(async (project) => {
          const read = await service.requireSession(project).open();
          if (read.kind !== 'readable')
            throw new HttpError(422, 'SOURCE_UNREADABLE', 'Fix the source before downloading evidence.');
          const evidence = read.snapshot.deployment.evidence.find((item) => item.id === context.params.id);
          if (!evidence || evidence.location.kind !== 'attachment')
            throw new HttpError(404, 'NOT_FOUND', 'No local attachment is available for this evidence.');
          const expected = evidence.location,
            handle = await project.root.openRead(expected.path),
            before = await handle.stat();
          try {
            context.response.setHeader('Content-Type', 'application/octet-stream');
            context.response.setHeader(
              'Content-Disposition',
              `attachment; filename="${basename(expected.path).replace(/[^A-Za-z0-9._-]/g, '_')}"`,
            );
            const hash = createHash('sha256');
            let size = 0;
            while (true) {
              const bytes = await handle.readChunk();
              if (!bytes.length) break;
              size += bytes.length;
              if (size > expected.size)
                throw new HttpError(409, 'EVIDENCE_CHANGED', 'Evidence changed during download.');
              hash.update(bytes);
              if (!context.response.write(bytes)) await waitForDrain(context.response);
            }
            const after = await project.root.stat(expected.path);
            if (
              size !== expected.size ||
              hash.digest('hex') !== expected.sha256 ||
              before.fileId !== after.fileId ||
              before.device !== after.device
            )
              throw new HttpError(409, 'EVIDENCE_CHANGED', 'Evidence changed during download.');
            context.response.end();
          } finally {
            await handle.close();
          }
        }),
    },
  ];
}
