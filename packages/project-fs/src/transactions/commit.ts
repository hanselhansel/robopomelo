import type { CommitInput, SessionOptions } from '../contracts.js';
import type { Journal } from './journal.js';
import { replaceSource } from './replace-source.js';
import { transactionBase, jsonWrite } from './io.js';
import { publishEvidence } from './evidence.js';
import { finalizeHistory } from '../history.js';
export async function commitPrepared(
  options: SessionOptions,
  input: CommitInput,
  journal: Journal,
  oldBytes: Buffer,
  newBytes: Buffer,
): Promise<void> {
  const { root, trust } = options;
  await publishEvidence(root, journal.evidence);
  await options.onProgress?.({ transactionId: journal.transactionId, phase: 'evidence-published' });
  const required = input.mutation.kind === 'review' ? ['record-decisions' as const] : ['author' as const];
  await trust.withAuthorization(
    { ...root.identity(), projectId: options.projectId },
    input.authorization,
    required,
    async () => {
      await replaceSource(root, `${transactionBase(journal.mutationId)}/replacement.yaml`, {
        prior: journal.prior.sourceHash,
        next: journal.next.sourceHash,
      });
      await root.fsyncDirectory();
    },
  );
  await options.onProgress?.({ transactionId: journal.transactionId, phase: 'source-replaced' });
  await finalizeHistory(root, journal, oldBytes, newBytes);
  await jsonWrite(root, `${transactionBase(journal.mutationId)}/committed.json`, {
    version: 1,
    mutationId: journal.mutationId,
    digest: journal.digest,
    ...journal.next,
  });
  await root.fsyncDirectory(transactionBase(journal.mutationId));
  await options.onProgress?.({ transactionId: journal.transactionId, phase: 'history-complete' });
}
