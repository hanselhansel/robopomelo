import type { AgentReply, ConnectionModel, DiscoveryRequest } from '@robopomelo/spec';

export interface ProviderAdapter {
  models(signal: AbortSignal): Promise<ConnectionModel[]>;
  propose(request: DiscoveryRequest, signal: AbortSignal): Promise<AgentReply>;
}

export type ProviderErrorCode =
  | 'PROVIDER_CAPABILITY'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_EMPTY'
  | 'PROVIDER_REFUSAL'
  | 'PROVIDER_SCHEMA'
  | 'PROVIDER_AUTH'
  | 'PROVIDER_NETWORK'
  | 'PROVIDER_LIMIT'
  | 'PROVIDER_CANCELLED'
  | 'AUTH_CANCELLED'
  | 'AUTH_EXPIRED'
  | 'AUTH_STATE_MISMATCH'
  | 'RESEARCH_PRIVATE_QUERY';

export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode, message: string, readonly retryAfterMs?: number) {
    super(message);
    this.name = 'ProviderError';
  }
}

export type TransportRequest = {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
};
export type TransportResponse = { status: number; headers: Record<string, string>; text(): Promise<string> };
/** Injected by the host; provider code never touches global fetch. */
export type Transport = (input: TransportRequest) => Promise<TransportResponse>;
/** Resolves the bearer token at call time; the caller owns the encrypted store. */
export type SecretProvider = () => Promise<string>;

export type ProviderUsage = { promptTokens: number; completionTokens: number };
export type ProposeResult = { reply: AgentReply; usage: ProviderUsage | null; costUsd: number | null };
