import { randomUUID } from 'node:crypto';
import { AgentGrantStore, HttpError, type ProjectService, type Route } from '@robopomelo/application';
import { SafeRoot, ProjectFsError, parseSource, validateBinding, sameRootIdentity } from '@robopomelo/project-fs';
import type { FolderMode, PresetId } from '@robopomelo/spec';
import type { AttachmentBroker } from './attachment-broker.js';
import { runSetupImport, setupStatus, type SetupInput, type SetupOperation, type SetupStatus } from './native-setup-import.js';
interface Prepared { revision: string; context: string; name: string; seed: 'blank' | 'inbound-pallet'; description: string; inputs: SetupInput[] }
interface Bound { revision: string; prepared: Prepared; path: string; preset: PresetId; mode: FolderMode; root: ReturnType<SafeRoot['identity']>; projectId: string | null }
const changed = () => new Error('SETUP_CHANGED: Project setup changed. Review it again before confirming.');
const REVISION = /^[a-f0-9-]{36}$/;
export class NativeSetupService {
  #prepared: Prepared | undefined;
  #bound: Bound | undefined;
  #operation: SetupOperation | undefined;
  #busy = false;
  readonly grants: AgentGrantStore;
  constructor(private readonly project: ProjectService, private readonly attachments: AttachmentBroker, private readonly onStatus: () => void) {
    this.grants = new AgentGrantStore(project.settings);
  }
  routes(): Route[] {
    return [
      { method: 'POST', path: '/api/intake/prepare', handler: context => this.prepare(context.body) },
      { method: 'GET', path: '/api/intake/status', projectScoped: false, handler: async () => this.status() },
      { method: 'POST', path: '/api/intake/resume', projectScoped: false, handler: context => this.resume(this.#revision(context.body)) },
      { method: 'POST', path: '/api/intake/discard', projectScoped: false, handler: async context => this.discard(this.#revision(context.body)) },
    ];
  }
  #revision(value: unknown): string {
    const body = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    if (Object.keys(body).join(',') !== 'revision' || typeof body.revision !== 'string' || !REVISION.test(body.revision))
      throw new HttpError(400, 'INVALID_INPUT', 'Supply the setup revision to continue.');
    return body.revision;
  }
  status(): SetupStatus { return setupStatus(this.#operation); }
  async prepare(value: unknown): Promise<{ revision: string }> {
    if (this.#busy) throw new HttpError(409, 'SETUP_BUSY', 'Project setup is already in progress.');
    if (this.#operation?.state === 'pending')
      throw new HttpError(409, 'SETUP_PENDING', 'An interrupted import is waiting. Resume it or discard it before starting another setup.');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'INVALID_INPUT', 'Supply project setup details.');
    const body = value as Record<string, unknown>;
    if (Object.keys(body).sort().join(',') !== 'attachmentIds,description,name,seed' ||
      typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200 ||
      typeof body.description !== 'string' || body.description.length > 16000 ||
      !['blank', 'inbound-pallet'].includes(String(body.seed)) ||
      !Array.isArray(body.attachmentIds) || body.attachmentIds.length > 20 ||
      body.attachmentIds.some(id => typeof id !== 'string' || !REVISION.test(id)))
      throw new HttpError(400, 'INVALID_INPUT', 'Check the project name, notes and selected attachments.');
    const context = this.project.epoch;
    const name = body.name.trim(), description = body.description, seed = body.seed as Prepared['seed'], ids = [...body.attachmentIds] as string[];
    this.#busy = true;
    try {
      const inputs = await this.attachments.collect(ids);
      if (context !== this.project.epoch) throw changed();
      const prepared: Prepared = { revision: randomUUID(), context, inputs, name, seed, description };
      this.#prepared = prepared; this.#bound = undefined; this.#operation = undefined;
      return { revision: prepared.revision };
    } finally { this.#busy = false; }
  }
  async preview(path: string, preset: PresetId, mode: FolderMode): Promise<{ revision: string; detail: string }> {
    const prepared = this.#prepared;
    if (this.#busy || !prepared || prepared.context !== this.project.epoch) throw changed();
    if (preset === 'inspection' && (mode !== 'open' || prepared.inputs.length || prepared.description.trim()))
      throw new Error('Inspection opens an existing project without importing files or notes.');
    await this.project.settings.read();
    const root = await SafeRoot.open(path);
    try {
      if (mode === 'create' && (await root.list()).length) throw new Error('Choose a new or empty project folder.');
      let projectId: string | null = null;
      if (mode === 'open') {
        const source = await root.readFile('deployment.yaml');
        try {
          const value = parseSource(source).value as { project?: { id?: unknown } };
          if (typeof value.project?.id === 'string') {
            validateBinding({ ...root.identity(), projectId: value.project.id });
            projectId = value.project.id;
          }
        } catch { /* Invalid source remains available for read-only inspection. */ }
      }
      const bound: Bound = { revision: randomUUID(), prepared, path, preset, mode, root: root.identity(), projectId };
      this.#bound = bound;
      return { revision: bound.revision, detail: [
        'Project: ' + prepared.name,
        mode === 'open' ? 'Open existing project.' : prepared.seed === 'inbound-pallet' ? 'Create a fictional editable example.' : 'Create a new project.',
        'Initial brief: ' + prepared.description.length + ' characters.',
        'Selected files: ' + prepared.inputs.length,
        ...prepared.inputs.map(input => '• ' + input.name),
      ].join('\n') };
    } finally { await root.close(); }
  }
  /** Called only by native main after the bound confirmation sheet was accepted. */
  async confirm(path: string, preset: PresetId, mode: FolderMode, revision?: string): Promise<void> {
    const bound = this.#bound;
    if (this.#busy || !bound || bound.revision !== revision || bound.path !== path || bound.preset !== preset || bound.mode !== mode ||
      bound.prepared !== this.#prepared || bound.prepared.context !== this.project.epoch) throw changed();
    this.#bound = undefined; this.#busy = true;
    try {
      try {
        if (mode === 'create') await this.project.create(path, bound.prepared.name, bound.prepared.seed === 'inbound-pallet', [], { expectedRoot: bound.root });
        else await this.project.open(path, [], undefined, { root: bound.root, projectId: bound.projectId });
      } catch (error) {
        if (error instanceof ProjectFsError && (error.code === 'ROOT_CHANGED' || error.code === 'PROJECT_CHANGED')) throw changed();
        throw error;
      }
      // The prepared intent is consumed once its project exists; the operation below carries the bytes.
      this.#prepared = undefined; this.attachments.clear();
      const operation = await this.project.withProject(async selected => {
        const identity = selected.root.identity();
        if (!sameRootIdentity(identity, bound.root)) throw changed();
        if (mode === 'open' && selected.projectId !== bound.projectId) throw changed();
        if (!selected.projectId) {
          if (preset === 'inspection') { selected.writeGrant = null; return undefined; }
          throw changed();
        }
        const binding = { ...identity, projectId: selected.projectId };
        const confirmation = await this.grants.issueNativeConfirmation(binding, preset);
        const granted = await this.grants.confirmPreset(binding, preset, confirmation);
        selected.writeGrant = granted.trustGrant;
        const inputs = preset === 'recommended' ? [...bound.prepared.inputs] : [];
        if (preset === 'recommended' && bound.prepared.description.trim())
          inputs.unshift({ id: 'brief', name: 'initial-brief.txt', bytes: new TextEncoder().encode(bound.prepared.description) });
        const operation: SetupOperation = {
          revision: bound.prepared.revision, projectEpoch: this.project.epoch, binding, preset,
          authorization: { grantId: granted.agentGrant.grantId, generation: granted.agentGrant.generation },
          trustGrant: granted.trustGrant, inputs, imported: new Set(), state: 'pending',
        };
        return operation;
      });
      if (!operation) return;
      this.#operation = operation;
      this.onStatus();
      await runSetupImport(this.project, this.grants, operation);
    } finally { this.#busy = false; this.onStatus(); }
  }
  /** Continue an interrupted import against the same confirmed project. Completed
   * operations return their status so a lost response can be read back. */
  async resume(revision: string): Promise<SetupStatus> {
    const operation = this.#operation;
    if (!operation || operation.revision !== revision) throw new HttpError(404, 'SETUP_NOT_FOUND', 'No matching project setup is waiting.');
    if (this.#busy || operation.state === 'importing') throw new HttpError(409, 'SETUP_BUSY', 'Project setup is already in progress.');
    if (operation.state === 'completed') return this.status();
    this.#busy = true;
    try {
      await runSetupImport(this.project, this.grants, operation);
      return this.status();
    } finally { this.#busy = false; this.onStatus(); }
  }
  discard(revision: string): SetupStatus {
    const operation = this.#operation;
    if (!operation || operation.revision !== revision) throw new HttpError(404, 'SETUP_NOT_FOUND', 'No matching project setup is waiting.');
    if (this.#busy || operation.state === 'importing') throw new HttpError(409, 'SETUP_BUSY', 'Project setup is already in progress.');
    this.#operation = undefined;
    return this.status();
  }
}
