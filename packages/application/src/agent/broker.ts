import type { ProviderRoute } from '@robopomelo/spec';
import { createOpenRouterAdapter, ProviderError, type ProviderAdapter, type Transport } from '@robopomelo/providers';
export interface ConnectionSummary {
  connectionId: string;
  route: ProviderRoute;
  label: string;
  /** Increments on disconnect or reconnect; a stale selection must never dispatch. */
  generation: number;
}
/** Machine-local connection metadata and secret access owned by the host.
 * Secrets are read at dispatch time only and never returned to callers. */
export interface ConnectionSource {
  list(): Promise<ConnectionSummary[]>;
  secret(connectionId: string): Promise<string>;
}
export type AdapterFactory = (input: { connectionId: string; transport: Transport; secret: () => Promise<string> }) => ProviderAdapter;
export interface BrokerOptions {
  transport?: Transport;
  adapters?: Partial<Record<ProviderRoute, AdapterFactory>>;
}
const RESPONSE_LIMIT = 8 * 1024 * 1024;
/** Narrow outbound transport: exact HTTPS URLs only, no cookies, no redirects. */
export const fetchTransport: Transport = async (input) => {
  const url = new URL(input.url);
  if (url.protocol !== 'https:' || url.username || url.password) throw new ProviderError('PROVIDER_CAPABILITY', 'Provider transport accepts exact HTTPS destinations only.');
  const response = await fetch(url, {
    method: input.method,
    headers: input.headers,
    ...(input.body === undefined ? {} : { body: input.body }),
    signal: input.signal,
    redirect: 'error',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  return {
    status: response.status,
    headers,
    text: async () => {
      const text = await response.text();
      if (text.length > RESPONSE_LIMIT) throw new ProviderError('PROVIDER_LIMIT', 'Provider response exceeds the accepted size.');
      return text;
    },
  };
};
const factories: Record<ProviderRoute, AdapterFactory | null> = {
  openrouter: (input) => createOpenRouterAdapter(input),
  // Account adapters require the A2 containment proof before they can be offered.
  codex: null,
  grok: null,
};
export class ProviderBroker {
  #adapters = new Map<string, { generation: number; adapter: ProviderAdapter }>();
  constructor(private readonly source: ConnectionSource, private readonly options: BrokerOptions = {}) {}
  async connections(): Promise<ConnectionSummary[]> {
    return this.source.list();
  }
  async adapter(connectionId: string): Promise<{ connection: ConnectionSummary; adapter: ProviderAdapter }> {
    const connection = (await this.source.list()).find((item) => item.connectionId === connectionId);
    if (!connection) throw new ProviderError('PROVIDER_CAPABILITY', 'The selected connection is not available on this machine.');
    const cached = this.#adapters.get(connectionId);
    if (cached && cached.generation === connection.generation) return { connection, adapter: cached.adapter };
    const factory = this.options.adapters?.[connection.route] ?? factories[connection.route];
    if (!factory) throw new ProviderError('PROVIDER_CAPABILITY', `${connection.route} account connections are not supported yet.`);
    const adapter = factory({
      connectionId,
      transport: this.options.transport ?? fetchTransport,
      secret: () => this.source.secret(connectionId),
    });
    this.#adapters.set(connectionId, { generation: connection.generation, adapter });
    return { connection, adapter };
  }
}
