import { expect, it } from 'vitest';
import { startServer } from '../../apps/cli/src/server/start.js';
async function responseFor(error: unknown) {
  const server = await startServer({
    toolVersion: 'test',
    routes: [
      {
        method: 'GET',
        path: '/api/project',
        handler: async () => {
          throw error;
        },
      },
    ],
  });
  try {
    const bootstrap = await fetch(server.url + '/api/session', {
      method: 'POST',
      headers: { Origin: server.url, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: new URL(server.bootstrapUrl).hash.slice(1) }),
    });
    const { data } = await bootstrap.json();
    const response = await fetch(server.url + '/api/project', {
      headers: { Authorization: `Bearer ${data.credential}`, 'X-RP-Project-Epoch': '0' },
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await server.close();
  }
}
it('reports a known filesystem operation without its private context', async () => {
  const error = Object.assign(new Error('private project text and credential-marker'), {
    code: 'EPERM',
    syscall: 'rename',
    path: '/private/source-marker',
    dest: '/private/destination-marker',
    stack: 'private stack-marker',
    cause: { credential: 'credential-marker' },
  });
  const result = await responseFor(error);
  expect(result.status).toBe(500);
  expect(result.body.error.code).toBe('INTERNAL_ERROR');
  expect(result.body.error.details).toEqual({ systemCode: 'EPERM', operation: 'rename' });
  expect(JSON.stringify(result.body)).not.toMatch(
    /private|credential-marker|source-marker|destination-marker|stack-marker/,
  );
});
it.each([
  { code: 'project-content', syscall: 'rename' },
  { code: 'EPERM', syscall: 'secret-value' },
  { code: 'EPERM', syscall: 'rename /private/source' },
  { code: 'EPERM', syscall: { sensitive: true } },
])('does not reflect arbitrary diagnostic fields: %j', async (fields) => {
  const result = await responseFor(Object.assign(new Error('private error message'), fields));
  expect(result.status).toBe(500);
  expect(result.body.error).not.toHaveProperty('details');
  expect(result.body.error).not.toHaveProperty('stack');
  expect(result.body.error.cause).toBeNull();
});

it.each([
  null,
  'private thrown value',
  { code: 'EPERM', syscall: 'rename' },
  Object.assign(new Error('private message'), { syscall: 'rename' }),
  Object.assign(new Error('private message'), { code: 123, syscall: 'rename' }),
  Object.assign(new Error('private message'), { code: { secret: true }, syscall: 'rename' }),
  Object.assign(new Error('private message'), { code: 'EPERM' }),
])('keeps unsupported thrown values and field types private', async (error) => {
  const result = await responseFor(error);
  expect(result.status).toBe(500);
  expect(result.body.error).not.toHaveProperty('details');
  expect(JSON.stringify(result.body)).not.toContain('private');
});
