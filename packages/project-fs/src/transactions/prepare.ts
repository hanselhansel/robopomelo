import type { CommitInput, SessionOptions } from '../contracts.js';
import type { PatchEvaluation } from '@robopomelo/spec';
import { byteHash } from './digest.js';
import { directory, immutable, jsonWrite, layout, transactionBase, metadataBytes } from './io.js';
import type { Journal } from './journal.js';
import { validateJournal } from './journal.js';
import { bindsEvidence, verifyFile } from './evidence.js';
import { flushContainingDirectories } from '../fs/durability.js';
export async function prepare(
  options: SessionOptions,
  input: CommitInput,
  digest: string,
  evaluated: PatchEvaluation,
  oldBytes: Buffer,
  newBytes: Buffer,
): Promise<Journal> {
  const journal: Journal = {
    version: 1,
    projectId: options.projectId,
    transactionId: options.id(),
    mutationId: input.idempotencyKey,
    idempotencyKey: input.idempotencyKey,
    digest,
    prior: input.expected,
    next: { sourceRevision: evaluated.deployment.meta.revisionId, sourceHash: byteHash(newBytes) },
    actor: input.actor,
    createdAt: evaluated.deployment.meta.updatedAt,
    mutation: input.mutation,
    diff: evaluated.diff,
    evidence: input.stagedEvidence ?? [],
    ...(input.supersedesProposalId ? { supersedesProposalId: input.supersedesProposalId } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
  };
  validateJournal(journal, options.projectId, input.idempotencyKey);
  bindsEvidence(evaluated.deployment, journal.evidence);
  metadataBytes(journal);
  for (const item of journal.evidence)
    await verifyFile(options.root, item.stagedPath, item.sha256, item.size);
  await layout(options.root);
  const base = transactionBase(input.idempotencyKey);
  await directory(options.root, base);
  await immutable(options.root, `${base}/old.yaml`, oldBytes);
  await immutable(options.root, `${base}/new.yaml`, newBytes);
  await immutable(options.root, `${base}/replacement.yaml`, newBytes);
  await jsonWrite(options.root, `${base}/journal.json`, journal);
  await flushContainingDirectories(options.root, [
    `${base}/journal.json`,
    ...journal.evidence.map((item) => item.stagedPath),
  ]);
  await options.onProgress?.({ transactionId: journal.transactionId, phase: 'journal-flushed' });
  return journal;
}
