import { expect, it } from 'vitest';
import { PublicReleaseNetwork } from '../../apps/cli/src/runtime/network.js';
it('allows only fixed public package endpoints and validates every redirect', async () => {
  const requests: string[] = [];
  const network = new PublicReleaseNetwork(async (url) => {
    requests.push(url);
    return new Response(null, { status: 302, headers: { location: 'https://evil.example/payload' } });
  });
  await expect(network.json('https://registry.npmjs.org/robopomelo/latest')).rejects.toMatchObject({
    code: 'UPDATE_URL_DENIED',
  });
  expect(requests).toEqual(['https://registry.npmjs.org/robopomelo/latest']);
  for (const url of [
    'http://registry.npmjs.org/robopomelo',
    'https://registry.npmjs.org:444/robopomelo',
    'https://user:secret@registry.npmjs.org/robopomelo',
    'https://registry.npmjs.org/other',
    'https://registry.npmjs.org/robopomelo?project=secret',
  ])
    await expect(network.json(url)).rejects.toMatchObject({ code: 'UPDATE_URL_DENIED' });
});
it('bounds metadata bytes, redirects and request duration', async () => {
  await expect(
    new PublicReleaseNetwork(async () => new Response('x'.repeat(100))).json(
      'https://registry.npmjs.org/robopomelo/latest',
      { maxBytes: 10 },
    ),
  ).rejects.toMatchObject({ code: 'UPDATE_LIMIT' });
  await expect(
    new PublicReleaseNetwork(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://registry.npmjs.org/robopomelo/latest' },
        }),
    ).json('https://registry.npmjs.org/robopomelo/latest'),
  ).rejects.toMatchObject({ code: 'UPDATE_REDIRECT_LIMIT' });
  await expect(
    new PublicReleaseNetwork(
      async (_url, signal) =>
        new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
    ).json('https://registry.npmjs.org/robopomelo/latest', { timeoutMs: 10 }),
  ).rejects.toThrow();
});
it('offline transport does not invoke even an injected network adapter', async () => {
  let calls = 0;
  const network = new PublicReleaseNetwork(async () => {
    calls++;
    return new Response('{}');
  });
  await expect(
    network.json('https://registry.npmjs.org/robopomelo/latest', { offline: true }),
  ).rejects.toMatchObject({ code: 'OFFLINE' });
  expect(calls).toBe(0);
});
