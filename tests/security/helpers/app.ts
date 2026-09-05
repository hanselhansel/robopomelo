import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../../../apps/cli/src/server/start.js';
import { projectRoutes } from '../../../apps/cli/src/server/project-routes.js';
import type { Route } from '../../../apps/cli/src/server/contracts.js';
import { ProjectService } from '../../../apps/cli/src/services/project.js';
export async function appFixture(extra: (service: ProjectService) => Route[] = () => []) {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'robopomelo-http-')));
  const service = new ProjectService({ toolVersion: 'test', configDirectory: join(temp, 'config') });
  let host: Awaited<ReturnType<typeof startServer>>;
  host = await startServer({
    toolVersion: 'test',
    routes: [...projectRoutes(service, () => host.setProjectStatus(service.status())), ...extra(service)],
    onClose: () => service.close(),
  });
  const boot = await fetch(host.url + '/api/session', {
    method: 'POST',
    headers: { Origin: host.url, 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: new URL(host.bootstrapUrl).hash.slice(1) }),
  });
  let session = (await boot.json()).data;
  async function call(path: string, data?: unknown, method?: string) {
    const response = await fetch(host.url + path, {
      method: method ?? (data ? 'POST' : 'GET'),
      headers: {
        Origin: host.url,
        Authorization: `Bearer ${session.credential}`,
        'X-RP-CSRF': session.csrf,
        'X-RP-Project-Epoch': session.projectEpoch,
        'Content-Type': 'application/json',
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const body = await response.json();
    if (body.data?.projectEpoch) session = { ...session, ...body.data };
    return { status: response.status, body };
  }
  await call('/api/projects/create', { path: join(temp, 'project'), name: 'Receiving' });
  await call('/api/trust', {
    action: 'grant',
    scopes: ['author', 'evidence', 'export', 'record-decisions'],
    mode: 'autonomous',
    remember: false,
  });
  async function raw(path: string, data?: string, method = 'GET', contentType = 'application/octet-stream') {
    return fetch(host.url + path, {
      method,
      headers: {
        Origin: host.url,
        Authorization: `Bearer ${session.credential}`,
        'X-RP-CSRF': session.csrf,
        'X-RP-Project-Epoch': session.projectEpoch,
        'Content-Type': contentType,
      },
      ...(data !== undefined ? { body: data } : {}),
    });
  }
  return {
    temp,
    service,
    host,
    call,
    raw,
    close: async () => {
      await host.close();
      await rm(temp, { recursive: true, force: true });
    },
  };
}
