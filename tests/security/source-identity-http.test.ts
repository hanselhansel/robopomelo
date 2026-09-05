import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../../apps/cli/src/server/start.js';
import { projectRoutes } from '../../apps/cli/src/server/project-routes.js';
import { ProjectService } from '../../apps/cli/src/services/project.js';
it('polls bounded source bytes without writes, grants, reconciliation or project disclosure', async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'robopomelo-identity-')));
  const service = new ProjectService({ toolVersion: 'test', configDirectory: join(temp, 'config') });
  await service.create(join(temp, 'project'), 'Original');
  const snapshot = await service.snapshot();
  const host = await startServer({
    toolVersion: 'test',
    routes: projectRoutes(service, () => {}),
    onClose: () => service.close(),
  });
  host.setProjectStatus(service.status());
  try {
    const boot = await fetch(host.url + '/api/session', {
      method: 'POST',
      headers: { Origin: host.url, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: new URL(host.bootstrapUrl).hash.slice(1) }),
    });
    const session = (await boot.json()).data;
    const call = (credential = session.credential, epoch = session.projectEpoch) =>
      fetch(host.url + '/api/project/source-identity', {
        headers: { Authorization: `Bearer ${credential}`, 'X-RP-Project-Epoch': epoch },
      });
    expect((await call('wrong')).status).toBe(403);
    expect((await call(session.credential, 'old')).status).toBe(409);
    expect((await (await call()).json()).data).toEqual({ sourceHash: snapshot.sourceHash });
    const source = join(temp, 'project', 'deployment.yaml');
    const original = await readFile(source, 'utf8');
    const changed = original.replace('Original', 'Externally changed');
    await writeFile(source, changed);
    const tree = await readdir(join(temp, 'project'), { recursive: true });
    expect((await (await call()).json()).data).toEqual({
      sourceHash: createHash('sha256').update(changed).digest('hex'),
    });
    expect(await readFile(source, 'utf8')).toBe(changed);
    expect(await readdir(join(temp, 'project'), { recursive: true })).toEqual(tree);
    expect(service.current!.writeGrant).toBeNull();
    await writeFile(source, 'malformed: [');
    expect((await (await call()).json()).data).toEqual({
      sourceHash: createHash('sha256').update('malformed: [').digest('hex'),
    });
    await writeFile(source, Buffer.alloc(8 * 1024 * 1024 + 1));
    expect((await (await call()).json()).data).toEqual({ unavailable: true });
    await rm(source);
    expect((await (await call()).json()).data).toEqual({ unavailable: true });
  } finally {
    await host.close();
    await rm(temp, { recursive: true, force: true });
  }
});
