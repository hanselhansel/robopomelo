// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { PatchEnvelope } from '@robopomelo/spec';
import { LocalApi } from '../src/lib/api.js';
import { digestJson } from '../src/lib/digest.js';

const patch: PatchEnvelope = {
  formatVersion: '1.0.0',
  id: 'retained-mutation',
  projectId: 'project',
  baseRevision: 'r1',
  baseHash: 'a'.repeat(64),
  actor: { kind: 'human', name: 'Author' },
  purpose: 'Retained edit',
  operations: [],
};
const response = (data: unknown) => new Response(JSON.stringify({ ok: true, data }));
afterEach(() => vi.unstubAllGlobals());

it('does not replay a rejected client request or ask for a receipt', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'STALE_BASE', message: 'Compare the current source.' },
        }),
        { status: 409 },
      ),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(new LocalApi().patch(patch)).rejects.toMatchObject({ code: 'STALE_BASE', status: 409 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('preserves an unknown outcome when neither the save nor its receipt can be read', async () => {
  const fetch = vi.fn(async (_path: string) => {
    throw new TypeError('Disconnected');
  });
  vi.stubGlobal('fetch', fetch);
  await expect(new LocalApi().patch(patch)).rejects.toMatchObject({ code: 'OUTCOME_UNKNOWN' });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1]?.[0]).toBe(
    `/api/changes/${patch.id}?digest=${digestJson({ kind: 'patch', patch })}`,
  );
});

it('recovers the exact proposal and includes supersession in its receipt binding', async () => {
  const paths: string[] = [];
  vi.stubGlobal('fetch', async (path: string) => {
    paths.push(path);
    if (path === '/api/patch/apply') throw new TypeError('Response lost');
    if (path.startsWith('/api/changes/')) return response({ status: 'proposed', proposalId: 'exact' });
    return response([
      { id: 'other', patchDigest: 'wrong', diff: ['unrelated'] },
      { id: 'exact', patchDigest: 'right', diff: [] },
    ]);
  });
  await expect(new LocalApi().patch(patch, 'prior-proposal')).resolves.toEqual({
    kind: 'proposal',
    proposalId: 'exact',
    patchDigest: 'right',
    diff: [],
  });
  expect(paths[1]).toBe(
    `/api/changes/${patch.id}?digest=${digestJson({
      mutation: { kind: 'patch', patch },
      supersedesProposalId: 'prior-proposal',
    })}`,
  );
});

it.each(['missing', 'unavailable'])('retains the operation when proposal readback is %s', async (mode) => {
  let writes = 0;
  vi.stubGlobal('fetch', async (path: string) => {
    if (path === '/api/patch/apply') {
      writes++;
      throw new TypeError('Response lost');
    }
    if (path.startsWith('/api/changes/')) return response({ status: 'proposed', proposalId: 'exact' });
    if (mode === 'unavailable') throw new TypeError('Readback unavailable');
    return response([{ id: 'other', patchDigest: 'wrong', diff: [] }]);
  });
  await expect(new LocalApi().patch(patch)).rejects.toMatchObject({ code: 'OUTCOME_UNKNOWN' });
  expect(writes).toBe(1);
});

it.each([
  ['pending', 'OUTCOME_UNKNOWN', 'pending'],
  ['indeterminate', 'OUTCOME_UNKNOWN', 'Source matches neither candidate.'],
  ['retired', 'MUTATION_RETIRED', 'explicitly retired'],
])('does not resubmit a %s receipt', async (status, code, message) => {
  let writes = 0;
  vi.stubGlobal('fetch', async (path: string) => {
    if (path === '/api/patch/apply') {
      writes++;
      throw new TypeError('Response lost');
    }
    return response({ status, reason: 'Source matches neither candidate.' });
  });
  await expect(new LocalApi().patch(patch)).rejects.toMatchObject({
    code,
    message: expect.stringContaining(message!),
  });
  expect(writes).toBe(1);
});

it.each([false, true])('replays an absent receipt with identical payload once (failure=%s)', async (fail) => {
  const bodies: unknown[] = [];
  vi.stubGlobal('fetch', async (path: string, options: RequestInit) => {
    if (path.startsWith('/api/changes/')) return response({ status: 'not-found' });
    bodies.push(options.body);
    if (bodies.length === 1 || fail) throw new TypeError('Response lost');
    return response({ kind: 'proposal', proposalId: patch.id, patchDigest: 'digest', diff: [] });
  });
  const operation = new LocalApi().patch(patch, 'prior-proposal');
  if (fail) await expect(operation).rejects.toMatchObject({ code: 'OUTCOME_UNKNOWN' });
  else await expect(operation).resolves.toMatchObject({ kind: 'proposal', proposalId: patch.id });
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toBe(bodies[0]);
  expect(JSON.parse(String(bodies[1]))).toEqual({ patch, supersedesProposalId: 'prior-proposal' });
});
