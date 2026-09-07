import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { ProjectService } from '../../../apps/cli/src/services/project.js';
import type { startApplication } from '../../../apps/cli/src/server/application.js';

export const baselineCommit = 'cf729ac0c383913454ebb9a66ce8100d2b0eb455';
export const fixedClock = '2026-09-07T00:00:00.000Z';

/** Uses the production HTTP routes. Only updater methods, which this flow never calls, are stubbed. */
export async function exercise(Service: typeof ProjectService, start: typeof startApplication) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'rp-application-parity-')));
  let nextId = 0;
  const service = new Service({
    toolVersion: 'parity-test',
    configDirectory: join(base, 'config'),
    clock: () => fixedClock,
    id: () => `shared-${++nextId}`,
  });
  const unused = async (): Promise<never> => {
    throw new Error('Unexpected updater call');
  };
  const host = await start(
    service,
    {
      status: unused,
      configure: unused,
      resume: unused,
      check: unused,
      install: unused,
      rollback: unused,
    },
    { launcherVersion: 'parity-test', toolVersion: 'parity-test', bundledRuntimeVersion: 'parity-test' },
    base,
  );
  try {
    const bootstrap = await fetch(`${host.url}/api/session`, {
      method: 'POST',
      headers: { Origin: host.url, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: new URL(host.bootstrapUrl).hash.slice(1) }),
    });
    if (bootstrap.status !== 200) throw new Error(`Bootstrap failed: ${bootstrap.status}`);
    const { data: session } = await bootstrap.json();
    const request = async (path: string, body?: unknown) => {
      const response = await fetch(host.url + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Origin: host.url,
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.credential}`,
          'X-RP-CSRF': session.csrf,
          'X-RP-Project-Epoch': service.status().projectEpoch,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.status !== 200) throw new Error(`${path}: ${response.status} ${await response.text()}`);
      return response;
    };
    const json = async (path: string, body?: unknown) => (await (await request(path, body)).json()).data;
    const projectPath = join(base, 'project');
    await json('/api/projects/create', { path: projectPath, name: 'Receiving' });
    await json('/api/projects/open', { path: projectPath });
    await json('/api/trust', {
      action: 'grant',
      scopes: ['author', 'export'],
      mode: 'autonomous',
      remember: false,
    });
    const before = (await json('/api/project')).snapshot;
    const committed = await json('/api/patch/apply', {
      patch: {
        formatVersion: '1.0.0',
        id: 'parity-change',
        projectId: before.deployment.project.id,
        baseRevision: before.sourceRevision,
        baseHash: before.sourceHash,
        actor: { kind: 'human', name: 'Parity engineer' },
        purpose: 'Preserve the shared service contract',
        operations: [
          {
            op: 'project',
            fields: { problem: { state: 'provided', value: 'The handoff owner is unclear.' } },
          },
        ],
      },
    });
    const validation = await json('/api/validate');
    const after = (await json('/api/project')).snapshot;
    const expected = { sourceRevision: after.sourceRevision, sourceHash: after.sourceHash };
    const preview = await json('/api/export/preview', { expected, selectedEvidenceIds: [] });
    const archive = await request('/api/export', { expected, previewId: preview.previewId });
    return {
      validation,
      committed,
      source: await readFile(join(projectPath, 'deployment.yaml'), 'utf8'),
      members: preview.members,
      artifacts: decodeFixtureArchive(Buffer.from(await archive.arrayBuffer())),
    };
  } finally {
    await host.close();
    await rm(base, { recursive: true, force: true });
  }
}

/** Read only this small generated ZIP, retaining artifact bytes without host-specific ZIP timestamps. */
function decodeFixtureArchive(zip: Buffer): Record<string, string> {
  const end = zip.length - 22;
  if (end < 0 || zip.readUInt32LE(end) !== 0x06054b50) throw new Error('Expected ZIP without comment');
  const count = zip.readUInt16LE(end + 10);
  if (count !== 7) throw new Error('Expected seven review artifacts');
  let offset = zip.readUInt32LE(end + 16);
  const artifacts: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid central directory');
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameSize = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    const local = zip.readUInt32LE(offset + 42);
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid local entry');
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const compressed = zip.subarray(start, start + compressedSize);
    if (method !== 0 && method !== 8) throw new Error('Unexpected ZIP method');
    const bytes = method === 8 ? inflateRawSync(compressed) : compressed;
    if (bytes.length !== zip.readUInt32LE(offset + 24)) throw new Error('Invalid artifact size');
    if (name in artifacts) throw new Error('Duplicate artifact');
    artifacts[name] = bytes.toString('base64');
    offset += 46 + nameSize + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  return artifacts;
}
