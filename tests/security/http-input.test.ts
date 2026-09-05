import { it, expect } from 'vitest';
import { startServer } from '../../apps/cli/src/server/start.js';
it.each([
  ['wrong type', 'text/plain', '{}', 415],
  ['invalid JSON', 'application/json', '{unfinished', 400],
  ['invalid UTF-8', 'application/json', Buffer.from([0xff]), 400],
  ['too many bytes', 'application/json', ' '.repeat(8 * 1024 * 1024 + 1), 413],
] as const)('rejects %s before invoking a route', async (_name, contentType, body, status) => {
  let calls = 0;
  const server = await startServer({
    toolVersion: 'test',
    routes: [
      {
        method: 'POST',
        path: '/api/operation',
        handler: async () => {
          calls++;
          return {};
        },
      },
    ],
  });
  try {
    const boot = await fetch(server.url + '/api/session', {
      method: 'POST',
      headers: { Origin: server.url, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: new URL(server.bootstrapUrl).hash.slice(1) }),
    });
    const { data } = await boot.json();
    const response = await fetch(server.url + '/api/operation', {
      method: 'POST',
      headers: {
        Origin: server.url,
        Authorization: `Bearer ${data.credential}`,
        'X-RP-CSRF': data.csrf,
        'X-RP-Project-Epoch': '0',
        'Content-Type': contentType,
      },
      body,
    });
    expect(response.status).toBe(status);
    expect((await response.json()).ok).toBe(false);
    expect(calls).toBe(0);
  } finally {
    await server.close();
  }
});
