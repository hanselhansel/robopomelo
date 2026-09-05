import { it, expect } from 'vitest';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../../apps/cli/src/server/start.js';
import { projectRoutes } from '../../apps/cli/src/server/project-routes.js';
import { ProjectService } from '../../apps/cli/src/services/project.js';
it('creates grants and persists a real source through the authenticated browser API', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'robopomelo-http-')));
  const service = new ProjectService({ toolVersion: 'test', configDirectory: join(temp, 'config') });
  let host: Awaited<ReturnType<typeof startServer>>;
  host = await startServer({
    toolVersion: 'test',
    routes: projectRoutes(service, () => host.setProjectStatus(service.status())),
    onClose: () => service.close(),
  });
  try {
    const boot = await fetch(host.url + '/api/session', {
      method: 'POST',
      headers: { Origin: host.url, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: new URL(host.bootstrapUrl).hash.slice(1) }),
    });
    let session = (await boot.json()).data;
    async function call(path: string, data?: unknown) {
      const response = await fetch(host.url + path, {
        method: data ? 'POST' : 'GET',
        headers: {
          Origin: host.url,
          Authorization: `Bearer ${session.credential}`,
          'X-RP-CSRF': session.csrf,
          'X-RP-Project-Epoch': session.projectEpoch,
          'Content-Type': 'application/json',
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      return { status: response.status, body: await response.json() };
    }
    const created = await call('/api/projects/create', { path: join(temp, 'project'), name: 'Receiving' });
    expect(created.status).toBe(200);
    session = { ...session, ...created.body.data };
    const grant = await call('/api/trust', {
      action: 'grant',
      scopes: ['author', 'export'],
      mode: 'autonomous',
      remember: false,
    });
    expect(grant.status).toBe(200);
    session = { ...session, ...grant.body.data };
    const current = (await call('/api/project')).body.data.snapshot;
    expect((await call('/api/trust')).body.data.root).toBe(join(temp, 'project'));
    const patch = {
      formatVersion: '1.0.0',
      id: 'browser-change',
      projectId: current.deployment.project.id,
      baseRevision: current.sourceRevision,
      baseHash: current.sourceHash,
      actor: { kind: 'human', name: 'Engineer' },
      purpose: 'Frame the problem',
      operations: [
        { op: 'project', fields: { problem: { state: 'provided', value: 'The handoff owner is unclear.' } } },
      ],
    };
    expect((await call('/api/patch/apply', { patch })).body.data.kind).toBe('committed');
    expect((await service.snapshot()).deployment.project.problem).toMatchObject({
      value: 'The handoff owner is unclear.',
    });
    expect((await call('/api/history')).body.data.length).toBeGreaterThan(1);
  } finally {
    await host.close();
    await rm(temp, { recursive: true, force: true });
  }
});
