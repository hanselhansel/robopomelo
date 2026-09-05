import type { Mutation, PatchEvaluation } from '@robopomelo/spec';
import { checkSchema } from '@robopomelo/spec';
import type { CommitInput, SessionOptions } from '../contracts.js';
import { ProjectFsError } from '../errors.js';
import { digestValue, mutationDigest, byteHash } from '../transactions/digest.js';
import {
  jsonRead,
  jsonWrite,
  immutable,
  layout,
  proposalBase,
  listOrEmpty,
  metadataBytes,
} from '../transactions/io.js';
import { isHash, isId, validateEvidence } from '../transactions/journal.js';
import { deploymentBytes } from '../transactions/snapshot.js';
import {
  closed,
  validActor,
  validDiff,
  validIdentity,
  validMutation,
  validOperation,
  validTimestamp,
} from '../transactions/metadata.js';
import { isDeepStrictEqual } from 'node:util';
type Request = Omit<CommitInput, 'authorization' | 'approvedPatchDigest'>;
export interface Proposal {
  version: 1;
  projectId: string;
  proposalId: string;
  requestDigest: string;
  digest: string;
  request: Request;
  effectiveMutation: Mutation;
  evidence: NonNullable<CommitInput['stagedEvidence']>;
  candidateHash: string;
  nextRevision: string;
  timestamp: string;
  diff: PatchEvaluation['diff'];
  supersedes: string | null;
}
function approvalDigest(proposal: Omit<Proposal, 'digest'>): string {
  return digestValue({
    requestDigest: proposal.requestDigest,
    effectiveMutation: proposal.effectiveMutation,
    evidence: proposal.evidence,
    candidateHash: proposal.candidateHash,
  });
}
export async function proposalRead(options: SessionOptions, id: string): Promise<Proposal> {
  if (!isId(id)) throw new ProjectFsError('INVALID_PROPOSAL', 'Invalid proposal ID.');
  const value = await jsonRead(options.root, `${proposalBase(id)}.json`);
  const p = value as Proposal;
  if (
    !closed(value, [
      'version',
      'projectId',
      'proposalId',
      'requestDigest',
      'digest',
      'request',
      'effectiveMutation',
      'evidence',
      'candidateHash',
      'nextRevision',
      'timestamp',
      'diff',
      'supersedes',
    ]) ||
    !p ||
    p.version !== 1 ||
    p.projectId !== options.projectId ||
    p.proposalId !== id ||
    !isHash(p.requestDigest) ||
    !isHash(p.digest) ||
    !isHash(p.candidateHash) ||
    !isId(p.nextRevision) ||
    !validTimestamp(p.timestamp) ||
    !validDiff(p.diff) ||
    !closed(
      p.request,
      ['expected', 'idempotencyKey', 'actor', 'mutation'],
      ['supersedesProposalId', 'stagedEvidence', 'operation'],
    ) ||
    !validActor(p.request.actor) ||
    !validIdentity(p.request.expected) ||
    !validMutation(p.request.mutation) ||
    (p.request.operation !== undefined && !validOperation(p.request.operation)) ||
    (p.supersedes !== null && (!isId(p.supersedes) || p.supersedes === id)) ||
    (p.request.supersedesProposalId ?? null) !== p.supersedes ||
    p.request.idempotencyKey !== id ||
    !validMutation(p.effectiveMutation) ||
    !isDeepStrictEqual(p.effectiveMutation, p.request.mutation)
  )
    throw new ProjectFsError('INVALID_PROPOSAL', 'Stored proposal is invalid.');
  const command =
    p.effectiveMutation.kind === 'patch' ? p.effectiveMutation.patch : p.effectiveMutation.review;
  if (
    checkSchema(command, p.effectiveMutation.kind).length ||
    command.id !== id ||
    command.projectId !== options.projectId ||
    command.baseHash !== p.request.expected.sourceHash ||
    command.baseRevision !== p.request.expected.sourceRevision ||
    !isDeepStrictEqual(command.actor, p.request.actor) ||
    mutationDigest(p.request as CommitInput) !== p.requestDigest ||
    approvalDigest(p) !== p.digest
  )
    throw new ProjectFsError('INVALID_PROPOSAL', 'Stored proposal digest or input is invalid.');
  validateEvidence(p.evidence);
  if (p.request.stagedEvidence !== undefined) validateEvidence(p.request.stagedEvidence);
  const bytes = await options.root.readFile(`${proposalBase(id)}.yaml`);
  if (
    byteHash(bytes) !== p.candidateHash ||
    deploymentBytes(bytes, options.projectId).deployment.meta.revisionId !== p.nextRevision
  )
    throw new ProjectFsError('INVALID_PROPOSAL', 'Proposal candidate source changed.');
  return p;
}
export async function saveProposal(
  options: SessionOptions,
  input: CommitInput,
  effective: CommitInput,
  evaluation: PatchEvaluation,
  bytes: Buffer,
): Promise<Proposal> {
  const { authorization: _authorization, approvedPatchDigest: _approval, ...request } = input;
  const base: Omit<Proposal, 'digest'> = {
    version: 1,
    projectId: options.projectId,
    proposalId: input.idempotencyKey,
    requestDigest: mutationDigest(input),
    request,
    effectiveMutation: effective.mutation,
    evidence: effective.stagedEvidence ?? [],
    candidateHash: byteHash(bytes),
    nextRevision: evaluation.deployment.meta.revisionId,
    timestamp: evaluation.deployment.meta.updatedAt,
    diff: evaluation.diff,
    supersedes: input.supersedesProposalId ?? null,
  };
  const proposal = { ...base, digest: approvalDigest(base) };
  metadataBytes(proposal);
  await layout(options.root);
  await immutable(options.root, `${proposalBase(proposal.proposalId)}.yaml`, bytes);
  await jsonWrite(options.root, `${proposalBase(proposal.proposalId)}.json`, proposal);
  await options.root.fsyncDirectory('.robopomelo/proposals');
  return proposal;
}
export function cumulative(input: CommitInput, prior: Proposal): CommitInput {
  if (
    input.mutation.kind !== 'patch' ||
    prior.effectiveMutation.kind !== 'patch' ||
    prior.request.expected.sourceHash !== input.expected.sourceHash ||
    prior.request.expected.sourceRevision !== input.expected.sourceRevision
  )
    throw new ProjectFsError(
      'PROPOSAL_BASE_MISMATCH',
      'Cumulative proposals must share the current source base and patch kind.',
    );
  // The client submits the complete desired diff from the unchanged committed
  // base. Supersedes records lineage; it never means concatenate operations.
  const inherited = prior.evidence.filter(
    (item) =>
      input.mutation.kind === 'patch' &&
      input.mutation.patch.operations.some(
        (op) =>
          op.op === 'add' &&
          op.collection === 'evidence' &&
          op.record !== null &&
          typeof op.record === 'object' &&
          !Array.isArray(op.record) &&
          op.record.id === item.evidenceId,
      ),
  );
  return { ...input, stagedEvidence: input.stagedEvidence ?? inherited };
}
export async function allProposals(options: SessionOptions): Promise<Proposal[]> {
  const proposals: Proposal[] = [];
  for (const name of await listOrEmpty(options.root, '.robopomelo/proposals'))
    if (/^[a-f0-9]{64}\.json$/.test(name)) {
      const raw = (await jsonRead(options.root, `.robopomelo/proposals/${name}`)) as { proposalId?: unknown };
      if (!isId(raw?.proposalId) || name !== `${byteHash(raw.proposalId)}.json`)
        throw new ProjectFsError('INVALID_PROPOSAL', 'Proposal filename is invalid.');
      proposals.push(await proposalRead(options, raw.proposalId));
    }
  return proposals;
}
