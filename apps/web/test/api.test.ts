// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest';
import { LocalApi } from '../src/lib/api.js';
import type { PatchEnvelope } from '@robopomelo/spec';
const patch: PatchEnvelope = {
  formatVersion: '1.0.0',
  id: 'm1',
  projectId: 'p1',
  baseRevision: 'r1',
  baseHash: 'a'.repeat(64),
  actor: { kind: 'human', name: 'Author' },
  purpose: 'Test patch',
  operations: [],
};
afterEach(() => vi.unstubAllGlobals());
it('recovers a committed response loss through receipt and immutable revision read', async () => {
  const paths: string[] = [];
  vi.stubGlobal('fetch', async (path: string) => {
    paths.push(path);
    if (path === '/api/patch/apply') throw new TypeError('Disconnected');
    if (path.startsWith('/api/changes/'))
      return new Response(
        JSON.stringify({
          ok: true,
          data: { status: 'committed', mutationId: 'm1', digest: 'x', sourceRevision: 'r2', sourceHash: 'b' },
        }),
      );
    return new Response(
      JSON.stringify({ ok: true, data: { snapshot: { sourceRevision: 'r2' }, entry: { diff: [] } } }),
    );
  });
  const api = new LocalApi();
  const result = await api.patch(patch);
  expect(result).toMatchObject({ kind: 'committed', snapshot: { sourceRevision: 'r2' } });
  expect(paths[2]).toBe('/api/history/r2');
});
it('includes the session and epoch binding but never cookies', async () => {
  let init: RequestInit | undefined;
  vi.stubGlobal('fetch', async (_path: string, options: RequestInit) => {
    init = options;
    return new Response(JSON.stringify({ ok: true, data: {} }));
  });
  const api = new LocalApi();
  api.setSession({
    credential: 'credential',
    csrf: 'csrf',
    projectEpoch: 'epoch',
    projectOpen: true,
    toolVersion: '1',
  });
  await api.request('/api/evidence/check', {});
  expect(init).toMatchObject({
    credentials: 'omit',
    headers: { Authorization: 'Bearer credential', 'X-RP-CSRF': 'csrf', 'X-RP-Project-Epoch': 'epoch' },
  });
});
