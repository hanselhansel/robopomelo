import { afterEach, expect, it } from 'vitest';
import { OAuthLoopbackFlow } from '../../packages/application/src/agent/oauth-flow.js';
import type { Transport } from '@robopomelo/providers';
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const exchange: Transport = async (input) => {
  expect(input.url).toBe('https://openrouter.ai/api/v1/auth/keys');
  const body = JSON.parse(input.body ?? '{}') as { code: string };
  return { status: body.code === 'good-code' ? 200 : 400, headers: {}, text: async () => JSON.stringify(body.code === 'good-code' ? { key: 'sk-or-secret' } : { error: 'bad' }) };
};
async function flow(transport = exchange) {
  const opened: string[] = [];
  const flow = new OAuthLoopbackFlow({ transport, openExternal: async (url) => { opened.push(url); }, timeoutMs: 5_000 });
  cleanup.push(() => flow.close());
  return { flow, opened };
}
const callbackOf = (url: string) => { const auth = new URL(url); return new URL(auth.searchParams.get('callback_url')!); };
it('opens only the validated OpenRouter URL, completes once via the loopback callback and hands the secret to the sink only', async () => {
  const f = await flow();
  const stored: string[] = [];
  const pending = f.flow.connect('openrouter', async (secret) => { stored.push(secret); return { connectionId: 'connection-1' }; });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(f.opened).toHaveLength(1);
  const auth = new URL(f.opened[0]!);
  expect(auth.origin + auth.pathname).toBe('https://openrouter.ai/auth');
  const callback = callbackOf(f.opened[0]!);
  expect(callback.hostname).toBe('127.0.0.1');
  const state = callback.searchParams.get('state')!;
  const response = await fetch(`${callback.origin}${callback.pathname}?state=${state}&code=good-code`);
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain('sk-or-secret');
  const result = await pending;
  expect(result).toEqual({ connectionId: 'connection-1' });
  expect(stored).toEqual(['sk-or-secret']);
  expect(JSON.stringify(result)).not.toContain('sk-or');
  await expect(fetch(`${callback.origin}${callback.pathname}?state=${state}&code=good-code`)).rejects.toThrow();
});
it('rejects a callback with the wrong state, keeps waiting, and times out or cancels cleanly', async () => {
  const f = await flow();
  const controller = new AbortController();
  const pending = f.flow.connect('openrouter', async () => ({ connectionId: 'c' }), controller.signal);
  await new Promise(resolve => setTimeout(resolve, 20));
  const callback = callbackOf(f.opened[0]!);
  const wrong = await fetch(`${callback.origin}${callback.pathname}?state=nope&code=good-code`);
  expect(wrong.status).toBe(400);
  const missing = await fetch(`${callback.origin}${callback.pathname}`);
  expect(missing.status).toBe(400);
  const other = await fetch(`${callback.origin}/elsewhere?state=x&code=y`);
  expect(other.status).toBe(404);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'AUTH_CANCELLED' });
  await expect(fetch(`${callback.origin}${callback.pathname}`)).rejects.toThrow();
});
it('refuses a second concurrent attempt and surfaces exchange failures without storing anything', async () => {
  const f = await flow();
  let stored = 0;
  const pending = f.flow.connect('openrouter', async () => { stored++; return { connectionId: 'c' }; });
  await new Promise(resolve => setTimeout(resolve, 20));
  await expect(f.flow.connect('openrouter', async () => ({ connectionId: 'd' }))).rejects.toMatchObject({ code: 'AUTH_IN_PROGRESS' });
  const callback = callbackOf(f.opened[0]!);
  const failure = expect(pending).rejects.toMatchObject({ code: expect.stringMatching(/^PROVIDER_|^AUTH_/) });
  const response = await fetch(`${callback.origin}${callback.pathname}?state=${callback.searchParams.get('state')}&code=bad-code`);
  expect(response.status).toBe(400);
  await failure;
  expect(stored).toBe(0);
  expect(f.opened).toHaveLength(1);
});
