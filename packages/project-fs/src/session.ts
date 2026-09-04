import {
  type Mutation,
  type PatchContext,
  type PatchEvaluation,
  type ProjectSnapshot,
} from '@robopomelo/spec';
import { evaluateRestore } from '../../core/src/restore.js';
import { acquireLock } from './fs/lock.js';
import type {
  CommitInput,
  CommitResult,
  Evaluation,
  OpenResult,
  RestoreInput,
  SessionOptions,
} from './contracts.js';
import { ProjectFsError } from './errors.js';
import { byteHash, mutationDigest } from './transactions/digest.js';
import { deploymentBytes, snapshotBytes } from './transactions/snapshot.js';
import { serializeCandidate } from './transactions/ast.js';
import { mutationStatus } from './transactions/receipts.js';
import { readJournal } from './transactions/journal.js';
import { EvaluationState } from './transactions/evaluation.js';
import { verifiedSnapshots, recoverTransactions } from './transactions/recover.js';
import { prepare } from './transactions/prepare.js';
import { commitPrepared } from './transactions/commit.js';
import { historyList, historyRead } from './history.js';
import { cumulative, proposalRead, saveProposal, allProposals } from './proposals/store.js';
import { missing } from './transactions/io.js';
import { prepareExternalReconciliation, knownBaseline } from './external-edits.js';

export class ProjectSession {
  #last: ProjectSnapshot | undefined;
  #baseline: ProjectSnapshot | undefined;
  #evaluation: EvaluationState;
  constructor(readonly options: SessionOptions) {
    this.#evaluation = new EvaluationState(options);
  }
  #binding() {
    return { ...this.options.root.identity(), projectId: this.options.projectId };
  }
  async #inspectAuthority() {
    await this.options.trust.withAuthorization(
      this.#binding(),
      this.options.authorization,
      ['inspect'],
      async () => {},
    );
  }
  async open(): Promise<OpenResult> {
    await this.#inspectAuthority();
    const bytes = await this.options.root.readFile('deployment.yaml');
    try {
      const snapshot = await snapshotBytes(bytes, this.options);
      let externalEdit = this.#last !== undefined && this.#last.sourceHash !== snapshot.sourceHash;
      if (!this.#baseline) {
        this.#baseline = await knownBaseline(this.options, snapshot);
        externalEdit = this.#baseline.sourceHash !== snapshot.sourceHash;
      }
      this.#evaluation.recordObservations(snapshot);
      this.#last = snapshot;
      return { kind: 'readable', snapshot, externalEdit };
    } catch (error) {
      if (
        error instanceof ProjectFsError &&
        ['PROJECT_MISMATCH', 'ROOT_CHANGED', 'ROOT_CLOSED'].includes(error.code)
      )
        throw error;
      const result: OpenResult = {
        kind: 'inspection',
        rawText: bytes.toString('utf8'),
        problems: [
          {
            code: error instanceof ProjectFsError ? error.code : 'SOURCE_UNREADABLE',
            message: error instanceof Error ? error.message : 'Source is unreadable.',
          },
        ],
      };
      if (this.#last)
        result.lastReadable = {
          sourceRevision: this.#last.sourceRevision,
          sourceHash: this.#last.sourceHash,
        };
      return result;
    }
  }
  async inspect(): Promise<OpenResult> {
    return this.open();
  }
  async preview(input: CommitInput): Promise<PatchEvaluation> {
    this.#evaluation.validate(input);
    await this.#inspectAuthority();
    const snapshot = await snapshotBytes(await this.options.root.readFile('deployment.yaml'), this.options);
    return this.options.trust.withAuthorization(
      this.#binding(),
      input.authorization,
      input.mutation.kind === 'review' ? ['record-decisions'] : ['author'],
      async (grant) =>
        this.#evaluation.evaluate(snapshot, input.mutation, this.#evaluation.context(snapshot, grant.scopes)),
    );
  }
  async commit(input: CommitInput): Promise<CommitResult> {
    if (input.operation)
      throw new ProjectFsError(
        'INVALID_MUTATION',
        'Use the explicit restore or reconciliation method for internal operations.',
      );
    return this.#commitEvaluated(input);
  }
  async #checkExternal(snapshot: ProjectSnapshot): Promise<void> {
    try {
      const known = (await historyRead(this.options.root, snapshot.sourceRevision, this.options)).snapshot;
      if (known.sourceHash === snapshot.sourceHash) {
        this.#baseline = known;
        return;
      }
      this.#baseline ??= known;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    if (!this.#baseline || this.#baseline.sourceHash === snapshot.sourceHash) {
      const entries = await historyList(this.options.root, this.options);
      const parentIds = new Set(entries.map((entry) => entry.parentRevisionId));
      const heads = entries.filter((entry) => !parentIds.has(entry.sourceRevision));
      if (heads.length === 1)
        this.#baseline = (
          await historyRead(this.options.root, heads[0]!.sourceRevision, this.options)
        ).snapshot;
    }
    if (this.#baseline && this.#baseline.sourceHash !== snapshot.sourceHash)
      throw new ProjectFsError(
        'EXTERNAL_RECONCILIATION_REQUIRED',
        'Reconcile the external source explicitly before further mutations.',
      );
    this.#baseline ??= snapshot;
  }
  async #pendingDiff(input: CommitInput, evaluator?: Evaluation): Promise<PatchEvaluation['diff']> {
    try {
      const base =
        this.#baseline?.sourceHash === input.expected.sourceHash
          ? this.#baseline
          : (await historyRead(this.options.root, input.expected.sourceRevision, this.options)).snapshot;
      if (base.sourceHash !== input.expected.sourceHash) return [];
      return await this.options.trust.withAuthorization(
        this.#binding(),
        input.authorization,
        input.mutation.kind === 'review' ? ['record-decisions'] : ['author'],
        async (grant) => {
          const context: PatchContext = {
            sourceRevision: base.sourceRevision,
            sourceHash: base.sourceHash,
            toolVersion: this.options.toolVersion,
            evidence: base.evidenceObservations,
            scopes: grant.scopes,
            nextRevision: this.options.id(),
            timestamp: this.options.clock(),
          };
          return (
            evaluator
              ? evaluator(base.deployment, context)
              : this.#evaluation.evaluate(base, input.mutation, context)
          ).diff;
        },
      );
    } catch {
      return [];
    } // The submitted mutation is retained even if its old source is unavailable or invalid.
  }
  async #commitEvaluated(input: CommitInput, evaluator?: Evaluation): Promise<CommitResult> {
    this.#evaluation.validate(input);
    await this.#inspectAuthority();
    const lease = await acquireLock(this.options.root, 'project', { timeoutMs: 10_000 });
    try {
      const digest = mutationDigest(input);
      const receipt = await mutationStatus(this.options, input.idempotencyKey, digest);
      if (receipt.status === 'committed') {
        const journal = await readJournal(this.options.root, this.options.projectId, input.idempotencyKey);
        const { newBytes } = await verifiedSnapshots(this.options, journal);
        return {
          kind: 'committed',
          snapshot: await snapshotBytes(newBytes, this.options),
          diff: journal.diff,
          receiptDigest: digest,
        };
      }
      if (receipt.status === 'pending' || receipt.status === 'indeterminate')
        throw new ProjectFsError(
          'RECOVERY_REQUIRED',
          'This mutation has incomplete recovery state. Inspect its receipt before retrying.',
        );
      let sourceBytes: Buffer, snapshot: ProjectSnapshot;
      try {
        sourceBytes = await this.options.root.readFile('deployment.yaml');
        snapshot = await snapshotBytes(sourceBytes, this.options);
      } catch (error) {
        if (error instanceof ProjectFsError && error.code === 'PROJECT_MISMATCH') throw error;
        throw new ProjectFsError('SOURCE_UNREADABLE', 'Source must be readable before mutation.');
      }
      if (
        snapshot.sourceRevision !== input.expected.sourceRevision ||
        snapshot.sourceHash !== input.expected.sourceHash
      )
        return {
          kind: 'conflict',
          expected: input.expected,
          current: { sourceRevision: snapshot.sourceRevision, sourceHash: snapshot.sourceHash },
          proposedDiff: await this.#pendingDiff(input, evaluator),
          mutation: input.mutation,
        };
      if (input.operation?.kind !== 'reconcile') await this.#checkExternal(snapshot);
      let effective = input,
        stored =
          receipt.status === 'proposed' ? await proposalRead(this.options, input.idempotencyKey) : undefined;
      if (stored) {
        if (input.approvedPatchDigest && input.approvedPatchDigest !== stored.digest)
          throw new ProjectFsError(
            'PROPOSAL_DIGEST_MISMATCH',
            'Approval does not match the immutable proposal digest.',
          );
        effective = { ...input, mutation: stored.effectiveMutation, stagedEvidence: stored.evidence };
      } else if (input.supersedesProposalId)
        effective = cumulative(input, await proposalRead(this.options, input.supersedesProposalId));
      if (input.approvedPatchDigest && !stored)
        throw new ProjectFsError('PROPOSAL_NOT_FOUND', 'An exact stored proposal is required for approval.');
      const evaluated = await this.options.trust.withAuthorization(
        this.#binding(),
        input.authorization,
        input.mutation.kind === 'review' ? ['record-decisions'] : ['author'],
        async (grant) => {
          const context = this.#evaluation.context(
            snapshot,
            grant.scopes,
            stored?.nextRevision,
            stored?.timestamp,
          );
          const evaluation = evaluator
            ? evaluator(snapshot.deployment, context)
            : this.#evaluation.evaluate(snapshot, effective.mutation, context);
          return { evaluation, mode: grant.mode };
        },
      );
      const newBytes = Buffer.from(
        serializeCandidate(
          deploymentBytes(sourceBytes, this.options.projectId).source,
          evaluated.evaluation.deployment,
        ),
      );
      if (stored && input.approvedPatchDigest && byteHash(newBytes) !== stored.candidateHash)
        throw new ProjectFsError(
          'PROPOSAL_CHANGED',
          'Proposal must be reviewed again because its evaluated candidate changed.',
        );
      if (evaluated.mode === 'review-each-change' && !input.approvedPatchDigest) {
        stored ??= await saveProposal(this.options, input, effective, evaluated.evaluation, newBytes);
        return {
          kind: 'proposal',
          proposalId: stored.proposalId,
          patchDigest: stored.digest,
          diff: stored.diff,
          receiptDigest: digest,
        };
      }
      const journal = await prepare(
        this.options,
        effective,
        digest,
        evaluated.evaluation,
        sourceBytes,
        newBytes,
      );
      await commitPrepared(this.options, effective, journal, sourceBytes, newBytes);
      const committed = await snapshotBytes(newBytes, this.options);
      this.#last = committed;
      this.#baseline = committed;
      return {
        kind: 'committed',
        snapshot: committed,
        diff: evaluated.evaluation.diff,
        receiptDigest: digest,
      };
    } finally {
      await lease.release();
    }
  }
  async mutationStatus(id: string, digest: string) {
    await this.#inspectAuthority();
    return mutationStatus(this.options, id, digest);
  }
  async proposalRead(id: string) {
    await this.#inspectAuthority();
    return proposalRead(this.options, id);
  }
  async proposalList() {
    await this.#inspectAuthority();
    const proposals = await allProposals(this.options);
    return Promise.all(
      proposals.map(async (proposal) => {
        const supersededBy =
          proposals.findLast((item) => item.supersedes === proposal.proposalId)?.proposalId ?? null;
        const receipt = await mutationStatus(this.options, proposal.proposalId, proposal.requestDigest);
        return {
          ...proposal,
          supersededBy,
          status:
            receipt.status === 'committed'
              ? ('applied' as const)
              : supersededBy
                ? ('superseded' as const)
                : ('pending' as const),
        };
      }),
    );
  }
  async recover() {
    await this.#inspectAuthority();
    return recoverTransactions(this.options);
  }
  async historyList() {
    await this.#inspectAuthority();
    return historyList(this.options.root, this.options);
  }
  async historyRead(revision: string) {
    await this.#inspectAuthority();
    return historyRead(this.options.root, revision, this.options);
  }
  async restore(revision: string, input: RestoreInput): Promise<CommitResult> {
    const historical = await this.historyRead(revision);
    if (
      historical.snapshot.evidenceObservations.some((item) =>
        ['missing', 'unreadable', 'mismatch'].includes(item.state),
      )
    )
      throw new ProjectFsError(
        'MISSING_HISTORY_EVIDENCE',
        'Restore requires the historical attachment bytes to be available and intact.',
      );
    const mutation: Mutation = {
      kind: 'patch',
      patch: {
        formatVersion: '1.0.0',
        id: input.idempotencyKey,
        projectId: this.options.projectId,
        baseRevision: input.expected.sourceRevision,
        baseHash: input.expected.sourceHash,
        actor: input.actor,
        purpose: input.purpose,
        operations: [],
      },
    };
    return this.#commitEvaluated(
      { ...input, mutation, operation: { kind: 'restore', revision } },
      (current, context) => evaluateRestore(current, historical.snapshot.deployment, mutation.patch, context),
    );
  }
  async reconcileExternal(
    expectedHash: string,
    actor: RestoreInput['actor'],
    authorization = this.options.authorization,
  ): Promise<CommitResult> {
    await this.#inspectAuthority();
    const plan = await prepareExternalReconciliation(
      this.options,
      expectedHash,
      actor,
      authorization,
      this.#baseline,
    );
    return this.#commitEvaluated(plan.input, plan.evaluate);
  }
  async close(): Promise<void> {
    await this.options.root.close();
  }
}
