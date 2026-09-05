import { randomUUID, createHash } from 'node:crypto';
import { extname } from 'node:path';
import type { Actor, Evidence, Json, PatchOperation } from '@robopomelo/spec';
import type { Authorization, CommitInput, CommitResult, SourceIdentity } from '../contracts.js';
import type { ProjectSession } from '../session.js';
import { ProjectFsError } from '../errors.js';
import { byteHash, mutationDigest } from '../transactions/digest.js';
import { directory } from '../transactions/io.js';
import { isHash, isId } from '../transactions/metadata.js';
import { FileSelection, ATTACHMENT_LIMIT } from './selection.js';
import { observeEvidence } from './observe.js';
export type EvidenceMetadata = Pick<Evidence, 'title' | 'purpose' | 'provenance' | 'relatedIds'> &
  Partial<Pick<Evidence, 'required' | 'description' | 'ownerId' | 'sourceEvidenceIds' | 'extensions'>>;
export interface EvidenceInput {
  expected: SourceIdentity;
  mutationId: string;
  authorization: Authorization;
  actor: Actor;
  metadata: EvidenceMetadata;
}
interface Upload {
  input: CommitInput;
  selected: { name: string; size: number; sha256: string };
  busy: boolean;
}
export class EvidenceService {
  #uploads = new Map<string, Upload>();
  constructor(private readonly session: ProjectSession) {}
  #record(input: EvidenceInput, location: Evidence['location']): Evidence {
    return {
      description: null,
      ownerId: null,
      sourceEvidenceIds: [],
      extensions: {},
      required: false,
      ...input.metadata,
      id: `evidence-${byteHash(input.mutationId).slice(0, 32)}`,
      location,
    };
  }
  #input(input: EvidenceInput, operations: PatchOperation[]): CommitInput {
    if (!isId(input.mutationId))
      throw new ProjectFsError('INVALID_MUTATION', 'A valid evidence mutation ID is required.');
    return {
      expected: input.expected,
      idempotencyKey: input.mutationId,
      authorization: input.authorization,
      actor: input.actor,
      mutation: {
        kind: 'patch',
        patch: {
          formatVersion: '1.0.0',
          id: input.mutationId,
          projectId: this.session.options.projectId,
          baseRevision: input.expected.sourceRevision,
          baseHash: input.expected.sourceHash,
          actor: input.actor,
          purpose: input.metadata.title,
          operations,
        },
      },
    };
  }
  async prepare(input: EvidenceInput & { selected: { name: string; size: number; sha256: string } }) {
    const selected = input.selected;
    if (
      !selected ||
      typeof selected.name !== 'string' ||
      !selected.name ||
      selected.name.length > 255 ||
      !Number.isSafeInteger(selected.size) ||
      selected.size < 0 ||
      selected.size > ATTACHMENT_LIMIT ||
      !isHash(selected.sha256)
    )
      throw new ProjectFsError(
        'LIMIT_EXCEEDED',
        'Supply a selected filename, SHA-256 and size no greater than 256 MiB.',
      );
    const uploadId = randomUUID(),
      suffix = extname(selected.name);
    const extension = /^\.[A-Za-z0-9]{1,12}$/.test(suffix) ? suffix.toLowerCase() : '.bin';
    const evidenceId = `evidence-${byteHash(input.mutationId).slice(0, 32)}`,
      finalPath = `evidence/${evidenceId}${extension}`,
      stagedPath = `.robopomelo/recovery/uploads/${uploadId}.part`;
    const record = this.#record(input, {
      kind: 'attachment',
      path: finalPath,
      sha256: selected.sha256,
      size: selected.size,
    });
    const mutation = this.#input(input, [
      { op: 'add', collection: 'evidence', record: record as unknown as Json },
    ]);
    mutation.stagedEvidence = [
      { evidenceId, stagedPath, finalPath, sha256: selected.sha256, size: selected.size },
    ];
    const receiptDigest = mutationDigest(mutation),
      status = await this.session.mutationStatus(input.mutationId, receiptDigest);
    if (status.status === 'not-found') await this.session.preview(mutation);
    else if (status.status !== 'committed' && status.status !== 'proposed')
      throw new ProjectFsError(
        'RECOVERY_REQUIRED',
        'The evidence mutation already has unresolved recovery state.',
      );
    this.#uploads.set(uploadId, { input: mutation, selected: { ...selected }, busy: false });
    return { uploadId, evidenceId, mutation: mutation.mutation, receiptDigest };
  }
  async accept(uploadId: string, stream: AsyncIterable<Uint8Array>): Promise<CommitResult> {
    const upload = this.#uploads.get(uploadId);
    if (!upload)
      throw new ProjectFsError(
        'UPLOAD_NOT_FOUND',
        'Upload selection does not belong to this project session.',
      );
    if (upload.busy) throw new ProjectFsError('UPLOAD_BUSY', 'This upload is already being received.');
    const status = await this.session.mutationStatus(
      upload.input.idempotencyKey,
      mutationDigest(upload.input),
    );
    if (status.status === 'committed' || status.status === 'proposed')
      return this.session.commit(upload.input);
    if (status.status !== 'not-found')
      throw new ProjectFsError('RECOVERY_REQUIRED', 'Resolve the existing evidence receipt before retrying.');
    upload.busy = true;
    const { root, trust, projectId } = this.session.options;
    const staged = upload.input.stagedEvidence![0]!;
    try {
      await trust.withAuthorization(
        { ...root.identity(), projectId },
        upload.input.authorization,
        ['author', 'evidence'],
        async () => {},
      );
      for (const path of ['.robopomelo', '.robopomelo/recovery', '.robopomelo/recovery/uploads'])
        await directory(root, path);
      const handle = await root.createExclusive(staged.stagedPath);
      const identity = await root.stat(staged.stagedPath);
      let complete = false;
      try {
        const hash = createHash('sha256');
        let size = 0;
        for await (const bytes of stream) {
          if (!(bytes instanceof Uint8Array))
            throw new ProjectFsError('INVALID_UPLOAD', 'Upload chunks must contain bytes.');
          size += bytes.byteLength;
          if (size > upload.selected.size || size > ATTACHMENT_LIMIT)
            throw new ProjectFsError('EVIDENCE_MISMATCH', 'Upload size differs from the selected bytes.');
          hash.update(bytes);
          await handle.write(bytes);
        }
        if (size !== upload.selected.size || hash.digest('hex') !== upload.selected.sha256)
          throw new ProjectFsError(
            'EVIDENCE_MISMATCH',
            'Upload SHA-256 or size differs from the selected bytes.',
          );
        await handle.sync();
        complete = true;
      } finally {
        await handle.close();
        if (!complete) await root.removeOwnedEntry(staged.stagedPath, identity);
      }
      return await this.session.commit(upload.input);
    } finally {
      upload.busy = false;
    }
  }
  async addFile(selection: FileSelection, input: EvidenceInput): Promise<CommitResult> {
    const selected = await selection.inspect();
    const prepared = await this.prepare({ ...input, selected });
    return this.accept(prepared.uploadId, selection.stream());
  }
  async reference(
    input: EvidenceInput,
    location: Exclude<Evidence['location'], { kind: 'attachment' }>,
  ): Promise<CommitResult> {
    const record = this.#record(input, location);
    return this.session.commit(
      this.#input(input, [{ op: 'add', collection: 'evidence', record: record as unknown as Json }]),
    );
  }
  async remove(id: string, input: EvidenceInput): Promise<CommitResult> {
    return this.session.commit(this.#input(input, [{ op: 'remove', collection: 'evidence', id }]));
  }
  async observe(ids?: string[]) {
    const opened = await this.session.open();
    if (opened.kind !== 'readable')
      throw new ProjectFsError('SOURCE_UNREADABLE', 'Evidence requires a readable project source.');
    return observeEvidence(
      this.session.options.root,
      opened.snapshot.deployment,
      this.session.options.clock,
      ids,
    );
  }
}
