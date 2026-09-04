import type {
  Actor,
  Collection,
  Deployment,
  FieldDiff,
  Json,
  PatchEnvelope,
  PatchOperation,
  ProjectSnapshot,
} from '@robopomelo/spec';
export type WriteResult =
  | { kind: 'committed'; snapshot: ProjectSnapshot; diff: FieldDiff[] }
  | { kind: 'proposal'; proposalId: string; patchDigest: string; diff: FieldDiff[] }
  | { kind: 'conflict'; current: { sourceRevision: string; sourceHash: string }; proposedDiff: FieldDiff[] };
export type SaveState =
  'Editing' | 'Saving' | 'Saved' | 'Proposed' | 'Save failed' | 'Changes conflict' | 'Outcome unknown';
export interface DraftView {
  committed: ProjectSnapshot;
  deployment: Deployment;
  state: SaveState;
  error: string | null;
  proposalId: string | null;
  dirty: boolean;
}
const collections: Collection[] = [
  'stakeholders',
  'needs',
  'problems',
  'workflows',
  'challenges',
  'risks',
  'assumptions',
  'kpis',
  'requirements',
  'acceptanceTests',
  'evidence',
  'decisions',
  'challengeAnswers',
];
const json = (value: unknown): Json => structuredClone(value) as Json;
function recordFields(value: object): Record<string, Json> {
  return json(value) as Record<string, Json>;
}
export function operationsBetween(base: Deployment, candidate: Deployment): PatchOperation[] {
  const result: PatchOperation[] = [];
  const changed = (a: object, b: object) =>
    Object.fromEntries(
      Object.entries(recordFields(b)).filter(
        ([key, v]) => JSON.stringify(v) !== JSON.stringify(recordFields(a)[key]),
      ),
    );
  const project = changed(base.project, candidate.project);
  if (Object.keys(project).length) result.push({ op: 'project', fields: project });
  for (const collection of collections) {
    const prior = new Map(base[collection].map((r) => [r.id, r]));
    const next = new Map(candidate[collection].map((r) => [r.id, r]));
    for (const row of candidate[collection]) {
      const before = prior.get(row.id);
      if (!before) result.push({ op: 'add', collection, record: json(row) });
      else {
        const fields = changed(before, row);
        if (Object.keys(fields).length) result.push({ op: 'update', collection, id: row.id, fields });
      }
    }
    for (const row of base[collection])
      if (!next.has(row.id)) result.push({ op: 'remove', collection, id: row.id });
  }
  return result;
}
export function applyLocal(deployment: Deployment, operation: PatchOperation): Deployment {
  const next = structuredClone(deployment);
  if (operation.op === 'project') Object.assign(next.project, operation.fields);
  else {
    const rows = next[operation.collection] as unknown as Record<string, Json>[];
    if (operation.op === 'add') rows.push(json(operation.record) as Record<string, Json>);
    if (operation.op === 'update') {
      const row = rows.find((r) => r.id === operation.id);
      if (row) Object.assign(row, operation.fields);
    }
    if (operation.op === 'remove') {
      const index = rows.findIndex((r) => r.id === operation.id);
      if (index >= 0) rows.splice(index, 1);
    }
  }
  return next;
}
export class DraftController {
  view: DraftView;
  #listeners = new Set<() => void>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #active: Promise<boolean> | null = null;
  #generation = 0;
  #actor: Actor = { kind: 'human', name: 'Local browser author' };
  setActor(actor: Actor) {
    this.#actor = actor;
  }
  #uncertain: {
    patch: PatchEnvelope;
    sent: Deployment;
    generation: number;
    supersedes: string | undefined;
  } | null = null;
  constructor(
    snapshot: ProjectSnapshot,
    private readonly send: (patch: PatchEnvelope, supersedes?: string) => Promise<WriteResult>,
  ) {
    this.view = {
      committed: snapshot,
      deployment: structuredClone(snapshot.deployment),
      state: 'Saved',
      error: null,
      proposalId: null,
      dirty: false,
    };
  }
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  #publish(update: Partial<DraftView>) {
    this.view = { ...this.view, ...update };
    for (const listener of this.#listeners) listener();
  }
  edit(operation: PatchOperation) {
    this.#generation++;
    this.#publish({
      deployment: applyLocal(this.view.deployment, operation),
      state: 'Editing',
      dirty: true,
      error: null,
    });
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      void this.flush();
    }, 500);
  }
  dispose() {
    clearTimeout(this.#timer);
    this.#listeners.clear();
  }
  copy() {
    return JSON.stringify(
      {
        pendingMutation: this.#uncertain?.patch ?? null,
        baseRevision: this.view.committed.sourceRevision,
        baseHash: this.view.committed.sourceHash,
        operations: operationsBetween(this.view.committed.deployment, this.view.deployment),
      },
      null,
      2,
    );
  }
  loadProposal(patch: PatchEnvelope, proposalId: string) {
    if (
      patch.baseHash !== this.view.committed.sourceHash ||
      patch.baseRevision !== this.view.committed.sourceRevision
    )
      throw new Error('Proposal base has changed.');
    let deployment = structuredClone(this.view.committed.deployment);
    for (const operation of patch.operations) deployment = applyLocal(deployment, operation);
    clearTimeout(this.#timer);
    this.#publish({ deployment, proposalId, dirty: false, state: 'Proposed', error: null });
  }
  replace(snapshot: ProjectSnapshot) {
    this.#uncertain = null;
    clearTimeout(this.#timer);
    this.#publish({
      committed: snapshot,
      deployment: structuredClone(snapshot.deployment),
      dirty: false,
      state: 'Saved',
      error: null,
      proposalId: null,
    });
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.#timer);
    if (this.#active) return this.#active;
    this.#active = this.#save();
    try {
      return await this.#active;
    } finally {
      this.#active = null;
    }
  }
  async #save(): Promise<boolean> {
    while (this.view.dirty) {
      const sent = this.#uncertain?.sent ?? structuredClone(this.view.deployment);
      const generation = this.#uncertain?.generation ?? this.#generation;
      const base = this.view.committed;
      const operations = operationsBetween(base.deployment, sent);
      if (!operations.length) {
        this.#publish({ dirty: false, state: 'Saved' });
        return true;
      }
      const patch: PatchEnvelope = this.#uncertain?.patch ?? {
        formatVersion: '1.0.0',
        id: crypto.randomUUID(),
        projectId: base.deployment.project.id,
        baseRevision: base.sourceRevision,
        baseHash: base.sourceHash,
        actor: structuredClone(this.#actor),
        purpose: 'Edit deployment planning document',
        operations,
      };
      const supersedes = this.#uncertain?.supersedes ?? this.view.proposalId ?? undefined;
      this.#publish({ state: 'Saving', error: null });
      try {
        const result = await this.send(patch, supersedes);
        this.#uncertain = null;
        if (result.kind === 'conflict') {
          this.#publish({
            state: 'Changes conflict',
            error:
              'The source changed. Your edits are retained. Compare current and proposed values before retrying.',
          });
          return false;
        }
        if (result.kind === 'proposal') {
          this.#publish({
            proposalId: result.proposalId,
            state: 'Proposed',
            dirty: generation !== this.#generation,
          });
        } else {
          const remaining = operationsBetween(sent, this.view.deployment);
          let deployment = structuredClone(result.snapshot.deployment);
          for (const op of remaining) deployment = applyLocal(deployment, op);
          this.#publish({
            committed: result.snapshot,
            deployment,
            proposalId: null,
            state: remaining.length ? 'Editing' : 'Saved',
            dirty: remaining.length > 0,
          });
        }
      } catch (error) {
        const code = (error as { code?: string }).code;
        this.#uncertain = code === 'OUTCOME_UNKNOWN' ? { patch, sent, generation, supersedes } : null;
        this.#publish({
          state:
            code === 'OUTCOME_UNKNOWN'
              ? 'Outcome unknown'
              : ['CONFLICT', 'STALE_BASE', 'SOURCE_CONFLICT'].includes(code ?? '') ||
                  (error as { status?: number }).status === 409
                ? 'Changes conflict'
                : 'Save failed',
          error: error instanceof Error ? error.message : 'The local server could not save your changes.',
        });
        return false;
      }
    }
    return true;
  }
}
