import { createHash } from 'node:crypto';
import type { AgentGrantStore, ProjectService } from '@robopomelo/application';
import { EvidenceService, ProjectFsError, type ProjectBinding, type TrustGrant } from '@robopomelo/project-fs';
import type { PresetId } from '@robopomelo/spec';
export type SetupInput = { id: string; name: string; bytes: Uint8Array };
/** One confirmed setup whose project exists. Retained in memory until the next
 * preparation so an interrupted import can resume and a lost response can be
 * read back without creating another project or duplicate evidence. */
export interface SetupOperation {
  revision: string;
  projectEpoch: string;
  binding: ProjectBinding;
  preset: PresetId;
  authorization: { grantId: string; generation: number };
  trustGrant: TrustGrant;
  inputs: SetupInput[];
  imported: Set<string>;
  state: 'importing' | 'pending' | 'completed';
  error?: string;
}
export type SetupStatus =
  | { state: 'idle' }
  | { state: 'pending' | 'completed'; revision: string; projectEpoch: string; imported: number; total: number; error?: string };
export function setupStatus(operation: SetupOperation | undefined): SetupStatus {
  if (!operation) return { state: 'idle' };
  return {
    state: operation.state === 'completed' ? 'completed' : 'pending',
    revision: operation.revision,
    projectEpoch: operation.projectEpoch,
    imported: operation.imported.size,
    total: operation.imported.size + operation.inputs.length,
    ...(operation.error === undefined ? {} : { error: operation.error }),
  };
}
export const mutationIdFor = (operation: Pick<SetupOperation, 'revision'>, input: SetupInput) =>
  'intake-' + operation.revision + '-' + input.id;
/** Import each remaining input in order. Inputs whose deterministic evidence
 * record is already committed are reconciled by readback and skipped. A failure
 * leaves the operation pending with the original bytes and identities intact. */
export async function runSetupImport(
  project: ProjectService,
  grants: AgentGrantStore,
  operation: SetupOperation,
): Promise<void> {
  if (operation.state === 'completed') return;
  operation.state = 'importing';
  delete operation.error;
  try {
    while (operation.inputs.length) {
      if (project.epoch !== operation.projectEpoch)
        throw new ProjectFsError('PROJECT_CHANGED', 'The project changed before the import finished. Reopen it to continue.');
      const input = operation.inputs[0]!;
      await project.withProject(async (selected) => {
        await grants.check(operation.binding, operation.authorization, ['import-attachments']);
        const session = project.requireSession(selected);
        const read = await session.open();
        if (read.kind !== 'readable') throw new Error('The project source needs inspection before import.');
        const mutationId = mutationIdFor(operation, input);
        if (read.snapshot.deployment.evidence.some((record) => record.id === EvidenceService.idFor(mutationId))) return;
        const evidence = new EvidenceService(session);
        const upload = await evidence.prepare({
          expected: { sourceRevision: read.snapshot.sourceRevision, sourceHash: read.snapshot.sourceHash },
          mutationId,
          authorization: operation.trustGrant,
          actor: { kind: 'human', name: 'Local project author' },
          metadata: {
            title: input.name,
            purpose: 'planning',
            relatedIds: [],
            provenance: {
              state: 'provided',
              value: input.id === 'brief' ? 'Entered during native project setup.' : 'Selected locally during native project setup.',
            },
            extensions: { 'robopomelo.intake': { formatVersion: '1.0.0', kind: input.id === 'brief' ? 'brief' : 'file' } },
          },
          selected: { name: input.name, size: input.bytes.byteLength, sha256: createHash('sha256').update(input.bytes).digest('hex') },
        });
        const result = await evidence.accept(upload.uploadId, (async function* () { yield input.bytes; })());
        if (result.kind !== 'committed') throw new Error('Planning input import requires completion before continuing.');
      }, operation.projectEpoch);
      operation.inputs.shift();
      operation.imported.add(input.id);
    }
    operation.state = 'completed';
  } catch (error) {
    operation.state = 'pending';
    operation.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
