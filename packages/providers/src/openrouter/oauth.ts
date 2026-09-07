import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ProviderError } from '../contracts.js';
import type { Transport } from '../contracts.js';
import { OPENROUTER_ORIGIN, isRecord, requestJson } from './http.js';

const AUTH_PATH = '/auth';
const EXCHANGE_URL = `${OPENROUTER_ORIGIN}/api/v1/auth/keys`;
const EXPECTED_PARAMS = ['callback_url', 'code_challenge', 'code_challenge_method'];
const DEFAULT_TTL_MS = 10 * 60_000;
const CANCELLED_MEMORY = 256;

export type RandomSource = (bytes: number) => Uint8Array;
export type BeginAuthorizationInput = { callbackUrl: string; now: number; random?: RandomSource };
export type BeginAuthorizationResult = { attemptId: string; state: string; url: string; expiresAt: number };
export type CompleteAuthorizationInput = {
  attemptId: string; state: string; code: string; now: number; transport: Transport; signal: AbortSignal;
};
export type OpenRouterOAuth = {
  beginAuthorization(input: BeginAuthorizationInput): BeginAuthorizationResult;
  completeAuthorization(input: CompleteAuthorizationInput): Promise<{ secret: string }>;
  cancelAuthorization(attemptId: string): void;
};

type Attempt = { verifier: string; state: string; expiresAt: number };

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function loopbackCallback(callbackUrl: string, state: string): string {
  let url: URL;
  try { url = new URL(callbackUrl); } catch { throw new ProviderError('PROVIDER_CAPABILITY', 'callback url is not a valid URL'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.hash || url.searchParams.has('state'))
    throw new ProviderError('PROVIDER_CAPABILITY', 'callback url must be a plain http://127.0.0.1 loopback URL');
  url.searchParams.set('state', state);
  return url.toString();
}

/** Exact-origin validation of the outgoing URL; suffix matches and credentials are rejected by construction. */
function validatedAuthorizationUrl(callback: string, challenge: string): string {
  const url = new URL(AUTH_PATH, OPENROUTER_ORIGIN);
  url.searchParams.set('callback_url', callback);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  const keys = [...url.searchParams.keys()].sort();
  if (url.origin !== OPENROUTER_ORIGIN || url.pathname !== AUTH_PATH || url.username || url.password || url.hash ||
    keys.length !== EXPECTED_PARAMS.length || keys.some((key, i) => key !== EXPECTED_PARAMS[i]))
    throw new ProviderError('PROVIDER_CAPABILITY', 'authorization url failed validation');
  return url.toString();
}

export function createOpenRouterOAuth(options: { ttlMs?: number; random?: RandomSource } = {}): OpenRouterOAuth {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const attempts = new Map<string, Attempt>();
  const cancelled = new Set<string>();
  const remember = (id: string) => {
    cancelled.add(id);
    if (cancelled.size > CANCELLED_MEMORY) { const first = cancelled.values().next().value; if (first !== undefined) cancelled.delete(first); }
  };
  return {
    beginAuthorization(input) {
      const random = input.random ?? options.random ?? ((n) => randomBytes(n));
      const verifier = base64url(random(32));
      const state = base64url(random(16));
      const challenge = base64url(createHash('sha256').update(verifier, 'ascii').digest());
      const callback = loopbackCallback(input.callbackUrl, state);
      const url = validatedAuthorizationUrl(callback, challenge);
      const attemptId = randomUUID();
      const expiresAt = input.now + ttl;
      attempts.set(attemptId, { verifier, state, expiresAt });
      return { attemptId, state, url, expiresAt };
    },
    async completeAuthorization(input) {
      const attempt = attempts.get(input.attemptId);
      attempts.delete(input.attemptId);
      if (!attempt) {
        if (cancelled.has(input.attemptId)) throw new ProviderError('AUTH_CANCELLED', 'authorization was cancelled');
        throw new ProviderError('AUTH_EXPIRED', 'authorization attempt is unknown, consumed or expired');
      }
      if (input.now >= attempt.expiresAt) throw new ProviderError('AUTH_EXPIRED', 'authorization attempt expired');
      if (attempt.state !== input.state) throw new ProviderError('AUTH_STATE_MISMATCH', 'authorization state mismatch');
      const body = { code: input.code, code_verifier: attempt.verifier, code_challenge_method: 'S256' };
      const response = await requestJson({ transport: input.transport, url: EXCHANGE_URL, method: 'POST', body, signal: input.signal });
      if (!isRecord(response) || typeof response.key !== 'string' || response.key.length === 0)
        throw new ProviderError('PROVIDER_SCHEMA', 'key exchange response did not contain a key');
      return { secret: response.key };
    },
    cancelAuthorization(attemptId) {
      if (attempts.delete(attemptId)) remember(attemptId);
    },
  };
}
