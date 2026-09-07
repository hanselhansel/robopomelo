import type { ConnectionModel, DiscoveryRequest } from '@robopomelo/spec';
import type { Transport, TransportRequest } from '../../packages/providers/src/index.js';

export type Recorded = { calls: TransportRequest[]; transport: Transport };
export type Canned = { status?: number; headers?: Record<string, string>; body?: unknown; text?: string };

export function fakeTransport(responses: Canned | Canned[] | ((request: TransportRequest) => Canned)): Recorded {
  const calls: TransportRequest[] = [];
  const queue = Array.isArray(responses) ? [...responses] : null;
  const transport: Transport = async (request) => {
    calls.push(request);
    if (request.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const canned: Canned = queue ? (queue.shift() ?? {}) : typeof responses === 'function' ? responses(request) : (responses as Canned);
    const text = canned.text ?? JSON.stringify(canned.body ?? {});
    return { status: canned.status ?? 200, headers: canned.headers ?? {}, text: async () => text };
  };
  return { calls, transport };
}

export const SECRET = 'sk-or-v1-test-secret-value-never-logged';
export const secret = async () => SECRET;

export function model(overrides: Partial<ConnectionModel> = {}): ConnectionModel {
  return {
    connectionId: 'conn-1', route: 'openrouter', modelId: 'vendor/model-a', label: 'Model A',
    efforts: ['low', 'medium', 'high'], inputKinds: ['text'], structuredActions: true, cancellation: true,
    ...overrides,
  };
}

export function request(overrides: Partial<DiscoveryRequest> = {}): DiscoveryRequest {
  return {
    sourceRevision: 'rev-1', sourceHash: 'hash-1', runId: 'run-1', generation: 1,
    connectionId: 'conn-1', modelId: 'vendor/model-a', effort: null,
    context: 'Fictional site context: two docks, one mezzanine.', maxOutputTokens: 512,
    ...overrides,
  };
}

export const validReply = {
  summary: 'Two docks feed a single mezzanine lift.',
  question: { id: 'q1', subjectIds: ['dock-1'], prompt: 'Which dock receives first?', choices: [{ id: 'a', label: 'Dock 1' }], why: 'Sequencing drives buffer size.' },
  proposedActions: [],
  citedSourceIds: ['src-1'],
};

export function completion(content: unknown, extra: Record<string, unknown> = {}, message: Record<string, unknown> = {}) {
  return { id: 'gen-1', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content, ...message } }], ...extra };
}

export async function failure(promise: Promise<unknown>): Promise<{ code: string; message: string; retryAfterMs?: number }> {
  try { await promise; } catch (error) {
    const e = error as { code: string; message: string; retryAfterMs?: number };
    return { code: e.code, message: e.message, ...(e.retryAfterMs === undefined ? {} : { retryAfterMs: e.retryAfterMs }) };
  }
  throw new Error('expected rejection');
}
