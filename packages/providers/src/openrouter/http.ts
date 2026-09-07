import { ProviderError } from '../contracts.js';
import type { SecretProvider, Transport, TransportResponse } from '../contracts.js';

export const OPENROUTER_ORIGIN = 'https://openrouter.ai';
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export type JsonRequest = {
  transport: Transport;
  url: string;
  method: 'GET' | 'POST';
  signal: AbortSignal;
  secret?: SecretProvider;
  body?: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function header(headers: Record<string, string>, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === name) return value;
  return undefined;
}

export function retryAfterMs(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

export function statusError(status: number, headers: Record<string, string>): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('PROVIDER_AUTH', `provider rejected credentials (${status})`);
  if (status === 429) return new ProviderError('PROVIDER_RATE_LIMIT', 'provider rate limit reached', retryAfterMs(header(headers, 'retry-after')));
  if (status >= 500) return new ProviderError('PROVIDER_NETWORK', `provider unavailable (${status})`);
  return new ProviderError('PROVIDER_SCHEMA', `provider rejected request (${status})`);
}

function cancelled(): ProviderError {
  return new ProviderError('PROVIDER_CANCELLED', 'request cancelled');
}

/** Errors thrown by transports are reduced to their name so credentials in foreign messages never propagate. */
function transportFailure(error: unknown, signal: AbortSignal): ProviderError {
  if (error instanceof ProviderError) return error;
  const name = error instanceof Error ? error.name : 'Error';
  if (signal.aborted || name === 'AbortError') return cancelled();
  return new ProviderError('PROVIDER_NETWORK', `transport failed (${name})`);
}

export async function requestJson(input: JsonRequest): Promise<unknown> {
  if (input.signal.aborted) throw cancelled();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (input.secret) headers.authorization = `Bearer ${await input.secret()}`;
  const request = { url: input.url, method: input.method, headers, signal: input.signal, ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }) };
  if (request.body !== undefined) headers['content-type'] = 'application/json';
  let response: TransportResponse;
  let text: string;
  try {
    response = await input.transport(request);
    if (response.status < 200 || response.status >= 300) throw statusError(response.status, response.headers);
    text = await response.text();
  } catch (error) {
    throw transportFailure(error, input.signal);
  }
  if (input.signal.aborted) throw cancelled();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new ProviderError('PROVIDER_LIMIT', 'provider response exceeds 8 MiB');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderError('PROVIDER_SCHEMA', 'provider response is not valid JSON');
  }
}
