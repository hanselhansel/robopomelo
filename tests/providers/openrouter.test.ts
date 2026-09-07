import { describe, expect, it } from 'vitest';
import { createOpenRouterAdapter, createOpenRouterOAuth, listModels, propose, ProviderError } from '../../packages/providers/src/index.js';
import { SECRET, completion, failure, fakeTransport, model, request, secret, validReply } from './helpers.js';

const callbackUrl = 'http://127.0.0.1:4321/callback';
const signal = new AbortController().signal;
const exchangeOk = { body: { key: 'sk-or-v1-exchanged' } };

describe('openrouter oauth pkce', () => {
  it('builds a validated authorization url without exposing the verifier', () => {
    const oauth = createOpenRouterOAuth();
    const begun = oauth.beginAuthorization({ callbackUrl, now: 1000 });
    const url = new URL(begun.url);
    expect(url.origin).toBe('https://openrouter.ai');
    expect(url.pathname).toBe('/auth');
    expect(url.username).toBe('');
    expect(url.hash).toBe('');
    expect([...url.searchParams.keys()].sort()).toEqual(['callback_url', 'code_challenge', 'code_challenge_method']);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const callback = new URL(url.searchParams.get('callback_url') ?? '');
    expect(callback.origin).toBe('http://127.0.0.1:4321');
    expect(callback.searchParams.get('state')).toBe(begun.state);
    expect(begun.expiresAt).toBe(1000 + 10 * 60_000);
    expect(Object.keys(begun).sort()).toEqual(['attemptId', 'expiresAt', 'state', 'url']);
    expect(JSON.stringify(begun)).not.toContain('verifier');
  });

  it('sends the verifier only in the exchange body and returns the secret once', async () => {
    const oauth = createOpenRouterOAuth();
    const { transport, calls } = fakeTransport(exchangeOk);
    const begun = oauth.beginAuthorization({ callbackUrl, now: 0 });
    const result = await oauth.completeAuthorization({ attemptId: begun.attemptId, state: begun.state, code: 'code-1', now: 1, transport, signal });
    expect(result).toEqual({ secret: 'sk-or-v1-exchanged' });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('https://openrouter.ai/api/v1/auth/keys');
    expect(call.method).toBe('POST');
    const body = JSON.parse(call.body ?? '{}') as Record<string, string>;
    expect(body.code).toBe('code-1');
    expect(body.code_challenge_method).toBe('S256');
    expect(body.code_verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(begun.url).not.toContain(body.code_verifier);
  });

  it('rejects a state mismatch and disposes the attempt', async () => {
    const oauth = createOpenRouterOAuth();
    const { transport, calls } = fakeTransport(exchangeOk);
    const begun = oauth.beginAuthorization({ callbackUrl, now: 0 });
    const first = await failure(oauth.completeAuthorization({ attemptId: begun.attemptId, state: 'wrong', code: 'c', now: 1, transport, signal }));
    expect(first.code).toBe('AUTH_STATE_MISMATCH');
    expect(calls).toHaveLength(0);
    const second = await failure(oauth.completeAuthorization({ attemptId: begun.attemptId, state: begun.state, code: 'c', now: 1, transport, signal }));
    expect(second.code).toBe('AUTH_EXPIRED');
  });

  it('rejects an expired attempt without a network call', async () => {
    const oauth = createOpenRouterOAuth();
    const { transport, calls } = fakeTransport(exchangeOk);
    const begun = oauth.beginAuthorization({ callbackUrl, now: 0 });
    const error = await failure(oauth.completeAuthorization({ attemptId: begun.attemptId, state: begun.state, code: 'c', now: begun.expiresAt, transport, signal }));
    expect(error.code).toBe('AUTH_EXPIRED');
    expect(calls).toHaveLength(0);
    expect((await failure(oauth.completeAuthorization({ attemptId: 'unknown', state: 'x', code: 'c', now: 1, transport, signal }))).code).toBe('AUTH_EXPIRED');
  });

  it('consumes the attempt before the exchange so a reused callback fails while in flight', async () => {
    const oauth = createOpenRouterOAuth();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const calls: string[] = [];
    const slow = async (input: { url: string }) => { calls.push(input.url); await gate; return { status: 200, headers: {}, text: async () => JSON.stringify({ key: 'k' }) }; };
    const begun = oauth.beginAuthorization({ callbackUrl, now: 0 });
    const args = { attemptId: begun.attemptId, state: begun.state, code: 'c', now: 1, transport: slow, signal };
    const first = oauth.completeAuthorization(args);
    const second = await failure(oauth.completeAuthorization(args));
    expect(second.code).toBe('AUTH_EXPIRED');
    release();
    expect(await first).toEqual({ secret: 'k' });
    expect(calls).toHaveLength(1);
  });

  it('reports a cancelled login and keeps other attempts independent', async () => {
    const oauth = createOpenRouterOAuth();
    const { transport, calls } = fakeTransport(exchangeOk);
    const a = oauth.beginAuthorization({ callbackUrl, now: 0 });
    const b = oauth.beginAuthorization({ callbackUrl, now: 0 });
    expect(a.state).not.toBe(b.state);
    oauth.cancelAuthorization(a.attemptId);
    expect((await failure(oauth.completeAuthorization({ attemptId: a.attemptId, state: a.state, code: 'c', now: 1, transport, signal }))).code).toBe('AUTH_CANCELLED');
    expect(calls).toHaveLength(0);
    await expect(oauth.completeAuthorization({ attemptId: b.attemptId, state: b.state, code: 'c', now: 1, transport, signal })).resolves.toEqual({ secret: 'sk-or-v1-exchanged' });
  });

  it('rejects an exchange response without a key and disposes the attempt', async () => {
    const oauth = createOpenRouterOAuth();
    for (const body of [{}, { key: '' }, { key: 42 }, { data: { key: 'x' } }]) {
      const { transport } = fakeTransport({ body });
      const begun = oauth.beginAuthorization({ callbackUrl, now: 0 });
      const args = { attemptId: begun.attemptId, state: begun.state, code: 'c', now: 1, transport, signal };
      expect((await failure(oauth.completeAuthorization(args))).code).toBe('PROVIDER_SCHEMA');
      expect((await failure(oauth.completeAuthorization(args))).code).toBe('AUTH_EXPIRED');
    }
  });

  it('rejects non-loopback or malformed callback urls', () => {
    const oauth = createOpenRouterOAuth();
    for (const bad of ['https://example.test/cb', 'http://localhost:1/cb', 'http://user:pw@127.0.0.1:1/cb', 'http://127.0.0.1:1/cb#frag', 'not a url']) {
      expect(() => oauth.beginAuthorization({ callbackUrl: bad, now: 0 })).toThrow(ProviderError);
    }
  });
});

describe('openrouter model inventory', () => {
  const inventory = { data: [
    { id: 'vendor/model-a', name: 'Model A', architecture: { input_modalities: ['text', 'image', 'audio'] }, supported_parameters: ['reasoning', 'response_format', 'max_tokens'] },
    { id: 'vendor/model-b', architecture: { input_modalities: ['text'] }, supported_parameters: ['max_tokens'] },
    { id: 'vendor/model-c', name: 'Model C', supported_parameters: ['structured_outputs'] },
  ] };

  it('maps models to connection models with real capabilities', async () => {
    const { transport, calls } = fakeTransport({ body: inventory });
    const models = await listModels({ connectionId: 'conn-1', transport, secret, signal });
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/models');
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(models).toEqual([
      { connectionId: 'conn-1', route: 'openrouter', modelId: 'vendor/model-a', label: 'Model A', efforts: ['low', 'medium', 'high'], inputKinds: ['text', 'image'], structuredActions: true, cancellation: true },
      { connectionId: 'conn-1', route: 'openrouter', modelId: 'vendor/model-b', label: 'vendor/model-b', efforts: [], inputKinds: ['text'], structuredActions: false, cancellation: true },
      { connectionId: 'conn-1', route: 'openrouter', modelId: 'vendor/model-c', label: 'Model C', efforts: [], inputKinds: ['text'], structuredActions: true, cancellation: true },
    ]);
  });

  it('returns an empty list for an empty inventory', async () => {
    const { transport } = fakeTransport({ body: { data: [] } });
    expect(await listModels({ connectionId: 'c', transport, secret, signal })).toEqual([]);
  });

  it('maps malformed json, auth, rate limit, server and size failures', async () => {
    const run = (canned: Parameters<typeof fakeTransport>[0]) => failure(listModels({ connectionId: 'c', transport: fakeTransport(canned).transport, secret, signal }));
    expect((await run({ text: '{not json' })).code).toBe('PROVIDER_SCHEMA');
    expect((await run({ body: { data: 'nope' } })).code).toBe('PROVIDER_SCHEMA');
    expect((await run({ body: { data: [{ name: 'no id' }] } })).code).toBe('PROVIDER_SCHEMA');
    expect((await run({ status: 401, body: { error: 'x' } })).code).toBe('PROVIDER_AUTH');
    expect((await run({ status: 403, body: {} })).code).toBe('PROVIDER_AUTH');
    const limited = await run({ status: 429, headers: { 'Retry-After': '7' }, body: {} });
    expect(limited.code).toBe('PROVIDER_RATE_LIMIT');
    expect(limited.retryAfterMs).toBe(7000);
    expect((await run({ status: 503, body: {} })).code).toBe('PROVIDER_NETWORK');
    const huge = await run({ text: 'x'.repeat(8 * 1024 * 1024 + 1) });
    expect(huge.code).toBe('PROVIDER_LIMIT');
  });

  it('reports an aborted request as cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const { transport } = fakeTransport({ body: inventory });
    expect((await failure(listModels({ connectionId: 'c', transport, secret, signal: controller.signal }))).code).toBe('PROVIDER_CANCELLED');
  });
});

describe('openrouter propose', () => {
  const run = (canned: Parameters<typeof fakeTransport>[0], overrides: { request?: Partial<ReturnType<typeof request>>; model?: Partial<ReturnType<typeof model>> } = {}) => {
    const recorded = fakeTransport(canned);
    return { ...recorded, result: propose(request(overrides.request), { transport: recorded.transport, secret, signal, model: model(overrides.model) }) };
  };

  it('decodes a schema-valid reply and pins the request to the exact model without fallbacks', async () => {
    const { result, calls } = run({ body: completion(JSON.stringify(validReply), { usage: { prompt_tokens: 12, completion_tokens: 34, cost: 0.0021 } }) }, { request: { effort: 'high' } });
    const out = await result;
    expect(out.reply).toEqual(validReply);
    expect(out.usage).toEqual({ promptTokens: 12, completionTokens: 34 });
    expect(out.costUsd).toBe(0.0021);
    const call = calls[0]!;
    expect(call.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(call.headers.authorization).toBe(`Bearer ${SECRET}`);
    const body = JSON.parse(call.body ?? '{}') as Record<string, unknown>;
    expect(body.model).toBe('vendor/model-a');
    expect(body.max_tokens).toBe(512);
    expect(body.provider).toEqual({ allow_fallbacks: false, require_parameters: true });
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.stream).toBe(false);
    const format = body.response_format as { type: string; json_schema: { strict: boolean; schema: { additionalProperties: boolean } } };
    expect(format.type).toBe('json_schema');
    expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.schema.additionalProperties).toBe(false);
    const messages = body.messages as { role: string; content: string }[];
    expect(messages.at(-1)).toEqual({ role: 'user', content: request().context });
  });

  it('tolerates missing usage and never fabricates cost', async () => {
    const out = await run({ body: completion(JSON.stringify(validReply)) }).result;
    expect(out.usage).toBeNull();
    expect(out.costUsd).toBeNull();
    const partial = await run({ body: completion(JSON.stringify(validReply), { usage: { prompt_tokens: 1, completion_tokens: 2 } }) }).result;
    expect(partial.usage).toEqual({ promptTokens: 1, completionTokens: 2 });
    expect(partial.costUsd).toBeNull();
  });

  it('omits reasoning when no effort is requested', async () => {
    const { result, calls } = run({ body: completion(JSON.stringify(validReply)) });
    await result;
    expect(JSON.parse(calls[0]?.body ?? '{}')).not.toHaveProperty('reasoning');
  });

  it('distinguishes empty, refusal and malformed content', async () => {
    expect((await failure(run({ body: completion('') }).result)).code).toBe('PROVIDER_EMPTY');
    expect((await failure(run({ body: completion(null) }).result)).code).toBe('PROVIDER_EMPTY');
    expect((await failure(run({ body: { choices: [] } }).result)).code).toBe('PROVIDER_EMPTY');
    expect((await failure(run({ body: completion('', {}, { refusal: 'I cannot help with that.' }) }).result)).code).toBe('PROVIDER_REFUSAL');
    expect((await failure(run({ body: { choices: [{ finish_reason: 'content_filter', message: { content: JSON.stringify(validReply) } }] } }).result)).code).toBe('PROVIDER_REFUSAL');
    expect((await failure(run({ body: completion('{"summary":') }).result)).code).toBe('PROVIDER_SCHEMA');
    expect((await failure(run({ text: 'not json at all' }).result)).code).toBe('PROVIDER_SCHEMA');
  });

  it('rejects replies that violate the closed AgentReply schema', async () => {
    const cases: unknown[] = [
      { ...validReply, extra: 1 },
      { ...validReply, summary: 'x'.repeat(4001) },
      { ...validReply, question: [validReply.question] },
      { ...validReply, question: { ...validReply.question, choices: Array.from({ length: 7 }, (_, i) => ({ id: String(i), label: 'l' })) } },
      { ...validReply, question: { ...validReply.question, why: undefined } },
      { ...validReply, question: { ...validReply.question, subjectIds: [1] } },
      { ...validReply, citedSourceIds: 'src-1' },
      { ...validReply, proposedActions: null },
      [validReply],
    ];
    for (const value of cases) {
      expect((await failure(run({ body: completion(JSON.stringify(value)) }).result)).code).toBe('PROVIDER_SCHEMA');
    }
    const nullQuestion = await run({ body: completion(JSON.stringify({ ...validReply, question: null, proposedActions: [{ anything: true }] })) }).result;
    expect(nullQuestion.reply.question).toBeNull();
    expect(nullQuestion.reply.proposedActions).toEqual([{ anything: true }]);
  });

  it('refuses to silently drop a requested effort or schema', async () => {
    const noEffort = run({ body: completion(JSON.stringify(validReply)) }, { request: { effort: 'high' }, model: { efforts: [] } });
    expect((await failure(noEffort.result)).code).toBe('PROVIDER_CAPABILITY');
    expect(noEffort.calls).toHaveLength(0);
    const unknownEffort = run({ body: completion(JSON.stringify(validReply)) }, { request: { effort: 'extreme' } });
    expect((await failure(unknownEffort.result)).code).toBe('PROVIDER_CAPABILITY');
    const noSchema = run({ body: completion(JSON.stringify(validReply)) }, { model: { structuredActions: false } });
    expect((await failure(noSchema.result)).code).toBe('PROVIDER_CAPABILITY');
    expect(noSchema.calls).toHaveLength(0);
    const wrongModel = run({ body: completion(JSON.stringify(validReply)) }, { request: { modelId: 'vendor/other' } });
    expect((await failure(wrongModel.result)).code).toBe('PROVIDER_CAPABILITY');
  });

  it('maps provider errors and cancellation', async () => {
    expect((await failure(run({ status: 429, headers: { 'retry-after': '2' }, body: {} }).result)).retryAfterMs).toBe(2000);
    expect((await failure(run({ status: 401, body: {} }).result)).code).toBe('PROVIDER_AUTH');
    expect((await failure(run({ body: { error: { code: 402, message: 'insufficient credits' } } }).result)).code).toBe('PROVIDER_NETWORK');
    const controller = new AbortController();
    const { transport } = fakeTransport((input) => { void input; controller.abort(); return { body: completion(JSON.stringify(validReply)) }; });
    expect((await failure(propose(request(), { transport, secret, signal: controller.signal, model: model() }))).code).toBe('PROVIDER_CANCELLED');
  });

  it('never leaks the bearer secret into errors', async () => {
    const leaky = fakeTransport(() => { throw new Error(`boom ${SECRET}`); });
    const error = await failure(propose(request(), { transport: leaky.transport, secret, signal, model: model() }));
    expect(error.code).toBe('PROVIDER_NETWORK');
    expect(error.message).not.toContain(SECRET);
    const schema = await failure(run({ text: `{"choices":[{"message":{"content":"${SECRET}"}}]}` }).result);
    expect(JSON.stringify(schema)).not.toContain(SECRET);
    expect(leaky.calls[0]?.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(leaky.calls[0]?.url).not.toContain(SECRET);
  });
});

describe('openrouter adapter', () => {
  it('caches the model list per instance and proposes with the selected model', async () => {
    const inventory = { data: [{ id: 'vendor/model-a', name: 'Model A', supported_parameters: ['reasoning', 'response_format'] }] };
    const { transport, calls } = fakeTransport((input) => input.method === 'GET' ? { body: inventory } : { body: completion(JSON.stringify(validReply)) });
    const adapter = createOpenRouterAdapter({ connectionId: 'conn-1', transport, secret });
    expect((await adapter.models(signal)).map((m) => m.modelId)).toEqual(['vendor/model-a']);
    await adapter.models(signal);
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(1);
    expect(await adapter.propose(request({ effort: 'low' }), signal)).toEqual(validReply);
    expect((await failure(adapter.propose(request({ modelId: 'vendor/missing' }), signal))).code).toBe('PROVIDER_CAPABILITY');
    const fresh = createOpenRouterAdapter({ connectionId: 'conn-1', transport, secret });
    await fresh.models(signal);
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
  });

  it('does not cache a failed model list', async () => {
    const { transport, calls } = fakeTransport([{ status: 503, body: {} }, { body: { data: [] } }]);
    const adapter = createOpenRouterAdapter({ connectionId: 'conn-1', transport, secret });
    expect((await failure(adapter.models(signal))).code).toBe('PROVIDER_NETWORK');
    expect(await adapter.models(signal)).toEqual([]);
    expect(calls).toHaveLength(2);
  });
});
