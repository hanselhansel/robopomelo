import { canonicalJson, semanticDiff, sha256, DomainError, type ProjectSnapshot } from '@robopomelo/core';
import type { Actor, Collection, Deployment, Json, PatchEnvelope, PatchOperation } from '@robopomelo/spec';
export class WizardDraft {
  base: ProjectSnapshot;
  value: Deployment;
  proposal: { id: string; digest: string } | null = null;
  #persisted: Deployment;
  constructor(snapshot: ProjectSnapshot) {
    this.base = structuredClone(snapshot);
    this.value = structuredClone(snapshot.deployment);
    this.#persisted = structuredClone(this.value);
  }
  dirty(): boolean {
    return canonicalJson(this.value as unknown as Json) !== canonicalJson(this.#persisted as unknown as Json);
  }
  fingerprint(): string {
    return sha256(canonicalJson(this.value as unknown as Json));
  }
  discardPending(): void {
    this.value = structuredClone(this.#persisted);
  }
  adopt(snapshot: ProjectSnapshot): void {
    this.base = structuredClone(snapshot);
    this.value = structuredClone(snapshot.deployment);
    this.#persisted = structuredClone(this.value);
    this.proposal = null;
  }
  markProposed(id: string, digest: string): void {
    this.proposal = { id, digest };
    this.#persisted = structuredClone(this.value);
  }
  patch(actor: Actor, purpose: string, id: string): PatchEnvelope {
    const operations: PatchOperation[] = [],
      updates = new Map<string, Extract<PatchOperation, { op: 'update' }>>(),
      project: Record<string, Json> = {};
    for (const change of semanticDiff(this.base.deployment, this.value)) {
      if (change.collection === 'project') {
        project[change.field] = change.after;
        continue;
      }
      if (change.collection === 'review' || change.collection === 'root')
        throw new DomainError(
          'FIELD_NOT_ALLOWED',
          'Use the protected review or explicit restore path for this metadata.',
        );
      const collection = change.collection as Collection;
      if (change.field === '$record') {
        operations.push(
          change.after === null
            ? { op: 'remove', collection, id: change.id }
            : { op: 'add', collection, record: change.after },
        );
        continue;
      }
      const key = `${collection}:${change.id}`,
        operation = updates.get(key) ?? { op: 'update', collection, id: change.id, fields: {} };
      operation.fields[change.field] = change.after;
      updates.set(key, operation);
    }
    if (Object.keys(project).length) operations.unshift({ op: 'project', fields: project });
    operations.push(...updates.values());
    return {
      formatVersion: '1.0.0',
      id,
      projectId: this.base.deployment.project.id,
      baseRevision: this.base.sourceRevision,
      baseHash: this.base.sourceHash,
      actor: structuredClone(actor),
      purpose,
      operations,
    };
  }
}
