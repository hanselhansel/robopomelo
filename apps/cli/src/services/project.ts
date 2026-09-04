import { randomUUID } from 'node:crypto';
import type { Actor, Mutation, PatchEnvelope, ReviewCommand, Scope } from '@robopomelo/spec';
import { createBlankProject, createInboundExample } from '@robopomelo/core';
import { SafeRoot } from '../../../../packages/project-fs/src/fs/safe-fs.js';
import { SettingsStore } from '../../../../packages/project-fs/src/settings/store.js';
import {
  TrustStore,
  type TrustGrant,
  type TrustMode,
} from '../../../../packages/project-fs/src/settings/trust.js';
import { ProjectSession } from '../../../../packages/project-fs/src/session.js';
import { initializeProject } from '../../../../packages/project-fs/src/init.js';
import { parseSource } from '../../../../packages/project-fs/src/yaml/parse.js';
import { ProjectFsError } from '../../../../packages/project-fs/src/errors.js';
import type { Authorization, OpenResult } from '../../../../packages/project-fs/src/contracts.js';
export interface ProjectServiceOptions {
  toolVersion: string;
  configDirectory?: string;
  clock?: () => string;
  id?: () => string;
}
export interface SelectedProject {
  root: SafeRoot;
  session: ProjectSession | null;
  projectId: string | null;
  writeGrant: TrustGrant | null;
  busy: Set<Promise<unknown>>;
  closing: boolean;
}
export class ProjectService {
  readonly settings: SettingsStore;
  readonly trust: TrustStore;
  readonly clock: () => string;
  readonly id: () => string;
  current: SelectedProject | null = null;
  epoch = '0';
  #selection = Promise.resolve();
  constructor(readonly options: ProjectServiceOptions) {
    this.settings = new SettingsStore(options.configDirectory);
    this.trust = new TrustStore(this.settings);
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.id = options.id ?? randomUUID;
  }
  status() {
    return {
      projectOpen: this.current !== null,
      projectEpoch: this.epoch,
      ...(this.current
        ? {
            root: this.current.root.identity().canonicalPath,
            scopes: [...new Set<Scope>(['inspect', ...(this.current.writeGrant?.scopes ?? [])])],
            mode: this.current.writeGrant?.mode ?? 'autonomous',
          }
        : {}),
    };
  }
  async open(
    path: string,
    scopes: Scope[] = [],
    expectedEpoch?: string,
  ): Promise<ReturnType<ProjectService['status']>> {
    const action = this.#selection.then(async () => {
      if (expectedEpoch !== undefined && expectedEpoch !== this.epoch)
        throw new ProjectFsError('PROJECT_CHANGED', 'Project changed before selection completed.');
      const root = await SafeRoot.open(path);
      try {
        await root.readFile('deployment.yaml');
        const selected: SelectedProject = {
          root,
          session: null,
          projectId: null,
          writeGrant: null,
          busy: new Set(),
          closing: false,
        };
        await this.#attach(selected, scopes);
        await this.#closeCurrent();
        this.current = selected;
        this.epoch = this.id();
        return this.status();
      } catch (error) {
        await root.close();
        throw error;
      }
    });
    this.#selection = action.then(
      () => {},
      () => {},
    );
    return action;
  }
  async #attach(selected: SelectedProject, scopes: Scope[]): Promise<void> {
    let projectId: string;
    try {
      const project = parseSource(await selected.root.readFile('deployment.yaml')).value.project;
      projectId = (project as { id: string }).id;
      if (typeof projectId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9.:_-]{0,127}$/.test(projectId)) return;
    } catch {
      return;
    }
    const binding = { ...selected.root.identity(), projectId };
    const inspect = this.trust.authorizeRun(binding, ['inspect'], 'autonomous');
    selected.projectId = projectId;
    selected.writeGrant = scopes.length
      ? this.trust.authorizeRun(binding, [...new Set<Scope>(['inspect', ...scopes])], 'autonomous')
      : ((await this.trust.lookup(binding)) ?? null);
    selected.session = new ProjectSession({
      root: selected.root,
      trust: this.trust,
      projectId,
      authorization: inspect,
      toolVersion: this.options.toolVersion,
      clock: this.clock,
      id: this.id,
    });
  }
  async create(path: string, name: string, example = false, scopes: Scope[] = []) {
    const metadata = { id: this.id(), revision: this.id(), timestamp: this.clock() };
    const deployment = example ? createInboundExample(metadata) : createBlankProject({ ...metadata, name });
    await initializeProject(path, deployment, ['author']);
    return this.open(path, scopes);
  }
  async withProject<T>(
    action: (selected: SelectedProject) => Promise<T>,
    expectedEpoch?: string,
  ): Promise<T> {
    const selected = this.current;
    if (!selected || selected.closing)
      throw new ProjectFsError('PROJECT_NOT_OPEN', 'Select a project first.');
    if (expectedEpoch !== undefined && expectedEpoch !== this.epoch)
      throw new ProjectFsError('PROJECT_CHANGED', 'The selected project changed.');
    const promise = Promise.resolve().then(() => action(selected));
    selected.busy.add(promise);
    try {
      return await promise;
    } finally {
      selected.busy.delete(promise);
    }
  }
  requireSession(selected: SelectedProject): ProjectSession {
    if (!selected.session)
      throw new ProjectFsError('SOURCE_UNREADABLE', 'Fix the source before using this operation.');
    return selected.session;
  }
  authorization(selected: SelectedProject): Authorization {
    if (!selected.writeGrant)
      throw new ProjectFsError('SCOPE_DENIED', 'Grant the required project scope before making this change.');
    return selected.writeGrant;
  }
  async read(): Promise<OpenResult> {
    return this.withProject(async (selected) => {
      if (!selected.session) await this.#attach(selected, []);
      if (selected.session) return selected.session.open();
      const rawText = (await selected.root.readFile('deployment.yaml')).toString('utf8');
      let message = 'Project identity is missing or invalid.';
      try {
        parseSource(rawText);
      } catch (error) {
        message = error instanceof Error ? error.message : message;
      }
      return { kind: 'inspection', rawText, problems: [{ code: 'SOURCE_UNREADABLE', message }] };
    });
  }
  async snapshot() {
    const read = await this.read();
    if (read.kind !== 'readable')
      throw new ProjectFsError('SOURCE_UNREADABLE', 'Source is currently available only for inspection.');
    return read.snapshot;
  }
  async grant(scopes: Scope[], mode: TrustMode, remember: boolean) {
    return this.withProject(async (selected) => {
      if (!selected.projectId)
        throw new ProjectFsError(
          'SOURCE_UNREADABLE',
          'A valid project identity is required for remembered authority.',
        );
      const binding = { ...selected.root.identity(), projectId: selected.projectId };
      const all = [...new Set<Scope>(['inspect', ...scopes])];
      selected.writeGrant = remember
        ? await this.trust.grant(binding, all, mode, { scopes: ['manage-settings'] })
        : this.trust.authorizeRun(binding, all, mode);
      return this.status();
    });
  }
  async forget() {
    return this.withProject(async (selected) => {
      if (selected.projectId)
        await this.trust.forget(
          { ...selected.root.identity(), projectId: selected.projectId },
          { scopes: ['manage-settings'] },
        );
      if (selected.writeGrant) await this.trust.revokeRun(selected.writeGrant.grantId);
      selected.writeGrant = null;
      return this.status();
    });
  }
  async apply(patch: PatchEnvelope, supersedesProposalId?: string) {
    return this.mutate({ kind: 'patch', patch }, supersedesProposalId);
  }
  async review(command: ReviewCommand) {
    return this.mutate({ kind: 'review', review: command });
  }
  async mutate(mutation: Mutation, supersedesProposalId?: string) {
    return this.withProject(async (selected) => {
      const command = mutation.kind === 'patch' ? mutation.patch : mutation.review;
      return this.requireSession(selected).commit({
        expected: { sourceRevision: command.baseRevision, sourceHash: command.baseHash },
        idempotencyKey: command.id,
        authorization: this.authorization(selected),
        actor: command.actor,
        mutation,
        ...(supersedesProposalId ? { supersedesProposalId } : {}),
      });
    });
  }
  async restore(
    revision: string,
    expected: { sourceRevision: string; sourceHash: string },
    actor: Actor,
    purpose: string,
    id = this.id(),
  ) {
    return this.withProject((selected) =>
      this.requireSession(selected).restore(revision, {
        expected,
        actor,
        purpose,
        idempotencyKey: id,
        authorization: this.authorization(selected),
      }),
    );
  }
  async #closeCurrent() {
    const selected = this.current;
    if (!selected) return;
    selected.closing = true;
    await Promise.allSettled(selected.busy);
    if (selected.session) await selected.session.close();
    else await selected.root.close();
    this.current = null;
  }
  async close() {
    await this.#selection;
    await this.#closeCurrent();
  }
}
