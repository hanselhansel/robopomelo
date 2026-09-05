import { it, expect } from 'vitest';
import { request } from 'node:http';
import { startServer } from '../../apps/cli/src/server/start.js';
it('rejects a project operation when selection changes while its body is arriving', async () => {
  let calls = 0;
  const server = await startServer({
    toolVersion: 'test',
    routes: [
      {
        method: 'POST',
        path: '/api/operation',
        handler: async () => {
          calls++;
          return { done: true };
        },
      },
    ],
  });
  try {
    server.setProjectStatus({ projectOpen: true, projectEpoch: 'first' });
    const bootstrap = await fetch(server.url + '/api/session', {
      method: 'POST',
      headers: { Origin: server.url, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: new URL(server.bootstrapUrl).hash.slice(1) }),
    });
    const { data } = await bootstrap.json();
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const pending = request(
        server.url + '/api/operation',
        {
          method: 'POST',
          headers: {
            Origin: server.url,
            Authorization: `Bearer ${data.credential}`,
            'X-RP-CSRF': data.csrf,
            'X-RP-Project-Epoch': 'first',
            'Content-Type': 'application/json',
            'Content-Length': '2',
            Expect: '100-continue',
          },
        },
        (response) => {
          let body = '';
          response.on('data', (chunk) => (body += chunk));
          response.on('end', () => resolve({ status: response.statusCode!, body }));
        },
      );
      pending.on('error', reject);
      pending.once('continue', () => {
        server.setProjectStatus({ projectOpen: true, projectEpoch: 'second' });
        pending.end('{}');
      });
      pending.flushHeaders();
    });
    expect(result.status).toBe(409);
    expect(JSON.parse(result.body).error.code).toBe('PROJECT_CHANGED');
    expect(calls).toBe(0);
  } finally {
    await server.close();
  }
});
