import type { ConnectionSource, ConnectionSummary } from '@robopomelo/application';
import type { ConnectionStatus, ProviderRoute } from '@robopomelo/spec';
import type { CredentialStore } from './credential-store.js';
import { CredentialError } from './credential-encryption.js';
export class ConnectionError extends Error {
  constructor(readonly code: 'CONNECTION_DISABLED' | 'CONNECTION_UNKNOWN') {
    super(code === 'CONNECTION_DISABLED' ? 'This connection is disabled until its stored credential is removed.' : 'Unknown connection.');
    this.name = 'ConnectionError';
  }
}
/** Sign-in flow boundary. The secret goes straight to the sink and is never returned. */
export interface SignInFlow {
  connect<T>(route: 'openrouter', sink: (secret: string) => Promise<T>, signal?: AbortSignal): Promise<T>;
  close(): Promise<void>;
}
const LABELS: Record<ProviderRoute, string> = { openrouter: 'OpenRouter', codex: 'Codex', grok: 'Grok' };
/** Machine-local connection lifecycle in Electron main. Disconnect deletes the
 * encrypted credential and bumps the generation first, so a stale selection
 * can never dispatch; a failed deletion leaves the connection disabled. */
export class ConnectionManager implements ConnectionSource {
  #generations = new Map<string, number>();
  #disabled = new Set<string>();
  #routes = new Map<string, ProviderRoute>();
  constructor(private readonly credentials: CredentialStore, private readonly flow: SignInFlow) {}
  async #records(): Promise<{ id: string; provider: ProviderRoute; label?: string }[]> {
    try {
      return await this.credentials.list();
    } catch (error) {
      if (error instanceof CredentialError && error.code === 'CREDENTIAL_ENCRYPTION_UNAVAILABLE') return [];
      throw error;
    }
  }
  #status(id: string, route: ProviderRoute, state: ConnectionStatus['state'], label: string | null): ConnectionStatus {
    return { connectionId: id, route, generation: this.#generations.get(id) ?? 1, state, accountLabel: label };
  }
  async list(): Promise<ConnectionSummary[]> {
    return (await this.#records())
      .filter((record) => !this.#disabled.has(record.id))
      .map((record) => ({ connectionId: record.id, route: record.provider, label: record.label ?? LABELS[record.provider], generation: this.#generations.get(record.id) ?? 1 }));
  }
  async secret(connectionId: string): Promise<string> {
    if (this.#disabled.has(connectionId)) throw new ConnectionError('CONNECTION_DISABLED');
    return this.credentials.getSecret(connectionId);
  }
  async statuses(): Promise<ConnectionStatus[]> {
    const records = await this.#records();
    const statuses = records.map((record) =>
      this.#status(record.id, record.provider, this.#disabled.has(record.id) ? 'disabled-cleanup-required' : 'connected', record.label ?? LABELS[record.provider]));
    for (const id of this.#disabled)
      if (!records.some((record) => record.id === id)) statuses.push(this.#status(id, this.#routes.get(id) ?? 'openrouter', 'disabled-cleanup-required', null));
    return statuses;
  }
  async status(connectionId: string): Promise<ConnectionStatus> {
    const found = (await this.statuses()).find((status) => status.connectionId === connectionId);
    return found ?? this.#status(connectionId, this.#routes.get(connectionId) ?? 'openrouter', 'disconnected', null);
  }
  async connect(route: 'openrouter', signal?: AbortSignal): Promise<ConnectionStatus> {
    if (!(await this.credentials.available())) throw new CredentialError('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
    const metadata = await this.flow.connect(route, (secret) => this.credentials.create(route, secret, LABELS[route]), signal);
    this.#routes.set(metadata.id, route);
    this.#generations.set(metadata.id, 1);
    return this.#status(metadata.id, route, 'connected', metadata.label ?? LABELS[route]);
  }
  async disconnect(connectionId: string): Promise<ConnectionStatus> {
    const route = this.#routes.get(connectionId) ?? (await this.#records()).find((record) => record.id === connectionId)?.provider ?? 'openrouter';
    this.#routes.set(connectionId, route);
    // Generation first: late requests on the old generation are rejected even if deletion fails.
    this.#generations.set(connectionId, (this.#generations.get(connectionId) ?? 1) + 1);
    this.#disabled.add(connectionId);
    try {
      await this.credentials.remove(connectionId);
    } catch {
      return this.#status(connectionId, route, 'disabled-cleanup-required', null);
    }
    this.#disabled.delete(connectionId);
    return this.#status(connectionId, route, 'disconnected', null);
  }
  async close(): Promise<void> {
    await this.flow.close();
  }
}
