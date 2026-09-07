import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { startDesktopService } from '../../apps/desktop/src/application-service.js';

it('owns a loopback application with one-use bootstrap and closes its listener', async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'rp-desktop-service-')));
  const assetRoot = join(base, 'ui');
  await mkdir(assetRoot);
  await writeFile(join(assetRoot, 'index.html'), '<title>Local workspace</title>');
  let service: Awaited<ReturnType<typeof startDesktopService>> | undefined;
  try {
    service = await startDesktopService({ assetRoot, configDirectory: join(base, 'config') });
    expect(service.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await (await fetch(service.url)).text()).toContain('Local workspace');
    const request = {
      method: 'POST',
      headers: { Origin: service.url, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: new URL(service.bootstrapUrl).hash.slice(1) }),
    };
    const response = await fetch(service.url + '/api/session', request);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ projectOpen: false, toolVersion: '0.0.0-development' });
    expect((await fetch(service.url + '/api/session', request)).status).toBe(403);
    const updates = await fetch(service.url + '/api/updates', {
      headers: { Origin: service.url, Authorization: 'Bearer ' + data.credential },
    });
    expect((await updates.json()).data).toMatchObject({ checkEligible: false, installEligible: false });
    const origin = service.url;
    await service.close();
    service = undefined;
    await expect(fetch(origin)).rejects.toThrow();
  } finally {
    await service?.close();
    await rm(base, { recursive: true, force: true });
  }
});
