import type {
  ProjectSnapshot,
  PatchEnvelope,
  Scope,
  Json,
  MutationReceipt,
  ReviewCommand,
  FieldDiff,
} from '@robopomelo/spec';
import type { WriteResult } from './draft.js';
import { digestJson } from './digest.js';
export interface Session {
  credential?: string;
  csrf?: string;
  projectEpoch: string;
  toolVersion: string;
  projectOpen: boolean;
  root?: string;
  mode?: 'autonomous' | 'review-each-change';
  scopes?: Scope[];
}
export type ProjectRead =
  | { kind: 'readable'; snapshot: ProjectSnapshot; externalEdit: boolean }
  | {
      kind: 'inspection';
      rawText: string;
      problems: { code: string; message: string }[];
      lastReadable?: { sourceRevision: string; sourceHash: string };
    };
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Json,
    public status = 0,
  ) {
    super(message);
  }
}
export class LocalApi {
  session: Session | null = null;
  private credential = '';
  private csrf = '';
  async bootstrap(): Promise<Session> {
    const params = new URLSearchParams(location.hash.slice(1));
    const secret =
      params.get('secret') ??
      params.get('token') ??
      (location.hash.length > 1 && !location.hash.includes('=') ? location.hash.slice(1) : null);
    history.replaceState(null, '', location.pathname + location.search);
    this.credential = sessionStorage.getItem('rp.credential') ?? '';
    this.csrf = sessionStorage.getItem('rp.csrf') ?? '';
    const session = secret
      ? await this.request<Session>('/api/session', { secret }, false)
      : await this.request<Session>('/api/session', undefined, false);
    this.setSession(session);
    return session;
  }
  setSession(session: Session) {
    this.session = session;
    if (session.credential) {
      this.credential = session.credential;
      sessionStorage.setItem('rp.credential', this.credential);
    }
    if (session.csrf) {
      this.csrf = session.csrf;
      sessionStorage.setItem('rp.csrf', this.csrf);
    }
  }
  async request<T>(
    path: string,
    body?: unknown,
    project = true,
    method?: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.raw(path, body, project, method, signal);
    const envelope = (await response.json()) as
      | { ok: true; data: T }
      | { ok: false; error: { code: string; message: string; details?: Json; action?: string } };
    if (!envelope.ok)
      throw new ApiError(
        envelope.error.code,
        envelope.error.message +
          (envelope.error.action?.trim() && envelope.error.action.trim() !== envelope.error.message.trim()
            ? ' ' + envelope.error.action
            : ''),
        envelope.error.details,
        response.status,
      );
    return envelope.data;
  }
  async raw(
    path: string,
    body?: unknown,
    project = true,
    method?: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    if (!path.startsWith('/api/') || path.startsWith('//'))
      throw new Error('Only the current local API is allowed.');
    const headers: Record<string, string> = { Authorization: `Bearer ${this.credential}` };
    if (body !== undefined) {
      headers['X-RP-CSRF'] = this.csrf;
      headers['Content-Type'] = body instanceof Blob ? 'application/octet-stream' : 'application/json';
    }
    if (project && this.session) headers['X-RP-Project-Epoch'] = this.session.projectEpoch;
    return fetch(path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      credentials: 'omit',
      ...(signal ? { signal } : {}),
      ...(body !== undefined ? { body: body instanceof Blob ? body : JSON.stringify(body) } : {}),
    });
  }
  async patch(patch: PatchEnvelope, supersedesProposalId?: string): Promise<WriteResult> {
    return this.commit(
      '/api/patch/apply',
      { patch, ...(supersedesProposalId ? { supersedesProposalId } : {}) },
      { kind: 'patch', patch },
      patch.id,
      supersedesProposalId,
    );
  }
  async review(command: ReviewCommand): Promise<WriteResult> {
    return this.commit('/api/review', { command }, { kind: 'review', review: command }, command.id);
  }
  private async commit(
    path: string,
    body: unknown,
    mutation: unknown,
    id: string,
    supersedesProposalId?: string,
  ): Promise<WriteResult> {
    try {
      return await this.request(path, body);
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) throw error;
      const digest = digestJson(supersedesProposalId ? { mutation, supersedesProposalId } : mutation);
      let receipt: MutationReceipt;
      try {
        receipt = await this.request(`/api/changes/${encodeURIComponent(id)}?digest=${digest}`);
      } catch {
        throw new ApiError(
          'OUTCOME_UNKNOWN',
          'The save response was lost and its receipt is unavailable. Your input and mutation identity are retained. Reconnect and retry the same operation.',
        );
      }
      if (receipt.status === 'committed') {
        try {
          const history = await this.request<{ snapshot: ProjectSnapshot; entry: { diff: FieldDiff[] } }>(
            `/api/history/${encodeURIComponent(receipt.sourceRevision)}`,
          );
          return { kind: 'committed', snapshot: history.snapshot, diff: history.entry.diff };
        } catch {
          throw new ApiError(
            'OUTCOME_UNKNOWN',
            `The receipt confirms revision ${receipt.sourceRevision}, but its immutable source could not be read. Keep the original mutation identity and retry after reconnecting.`,
          );
        }
      }
      if (receipt.status === 'proposed') {
        try {
          const proposals =
            await this.request<{ id: string; patchDigest: string; diff: FieldDiff[] }[]>('/api/proposals');
          const proposal = proposals.find((p) => p.id === receipt.proposalId);
          if (proposal)
            return {
              kind: 'proposal',
              proposalId: proposal.id,
              patchDigest: proposal.patchDigest,
              diff: proposal.diff,
            };
        } catch {
          throw new ApiError(
            'OUTCOME_UNKNOWN',
            'The proposal receipt exists, but its exact stored diff could not be read. Keep this operation identity until readback succeeds.',
          );
        }
      }
      if ((receipt.status as string) === 'retired')
        throw new ApiError(
          'MUTATION_RETIRED',
          'This uncommitted attempt was explicitly retired. Your input is retained. Compare the current source and submit a fresh checked change with a new identity.',
        );
      if (receipt.status === 'not-found') {
        try {
          return await this.request(path, body);
        } catch {
          throw new ApiError(
            'OUTCOME_UNKNOWN',
            'The identical save was replayed, but its outcome is still unknown. Check again after reconnecting.',
          );
        }
      }
      throw new ApiError(
        'OUTCOME_UNKNOWN',
        receipt.status === 'indeterminate'
          ? receipt.reason
          : 'The operation receipt is still pending. Keep this draft open and check again.',
      );
    }
  }
  async open(path: string, name?: string, example = false) {
    const status = await this.request<Session>(
      name === undefined ? '/api/projects/open' : '/api/projects/create',
      name === undefined ? { path } : { path, name, ...(example ? { example: 'inbound-pallet' } : {}) },
      false,
    );
    this.setSession(status);
    return this.request<ProjectRead>('/api/project');
  }
}
export const api = new LocalApi();
export const expected = (snapshot: ProjectSnapshot) => ({
  sourceRevision: snapshot.sourceRevision,
  sourceHash: snapshot.sourceHash,
});
export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
