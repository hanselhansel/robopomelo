import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentGrantStore } from '../../packages/application/src/agent-grants.js';
import { SettingsStore, SafeRoot, TrustStore } from '../../packages/project-fs/src/index.js';

const cleanup: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture() {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'rp-agent-grants-')));
  cleanup.push(base);
  await mkdir(join(base, 'project'));
  const root = await SafeRoot.open(join(base, 'project'));
  const binding = { ...root.identity(), projectId: 'project-1' };
  await root.close();
  const config = join(base, 'config');
  const settings = new SettingsStore(config);
  return {
    binding,
    config,
    settings,
    grants: new AgentGrantStore(settings),
    trust: new TrustStore(settings),
  };
}
const authorization = (grant: { grantId: string; generation: number }) => ({
  grantId: grant.grantId,
  generation: grant.generation,
});
async function recommended(f: Awaited<ReturnType<typeof fixture>>) {
  return f.grants.confirmPreset(
    f.binding,
    'recommended',
    await f.grants.issueNativeConfirmation(f.binding, 'recommended'),
  );
}
it('selecting a preset or submitting ordinary authority never grants permission', async () => {
  const f = await fixture();
  expect(await f.grants.lookup(f.binding)).toBeUndefined();
  for (const token of [true, { confirmed: true }, { actor: 'human' }, { scopes: ['manage-settings'] }]) {
    await expect(f.grants.confirmPreset(f.binding, 'recommended', token as never)).rejects.toMatchObject({
      code: 'SCOPE_DENIED',
    });
  }
  expect((await f.settings.read()).agentGrants).toBeUndefined();
  await expect(stat(f.config)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('writes ordinary human scopes and separate AI scopes in one atomic generation', async () => {
  const f = await fixture();
  const update = vi.spyOn(f.settings, 'update');
  const { trustGrant, agentGrant } = await recommended(f);
  expect(update).toHaveBeenCalledTimes(1);
  const disk = JSON.parse(await readFile(join(f.config, 'settings.json'), 'utf8'));
  expect(disk.generation).toBe(1);
  expect(disk.grants).toEqual([trustGrant]);
  expect(disk.agentGrants).toEqual([agentGrant]);
  expect(trustGrant.scopes).toEqual(['inspect', 'author', 'evidence', 'export', 'record-decisions']);
  expect(agentGrant.scopes).toEqual(['use-connected-ai', 'public-research', 'import-attachments']);
  expect(agentGrant.trustGrantId).toBe(trustGrant.grantId);
  expect(agentGrant.generation).toBe(trustGrant.generation);
  expect(await f.grants.check(f.binding, authorization(agentGrant), ['public-research'])).toEqual(agentGrant);
  await expect(f.trust.withAuthorization(f.binding, trustGrant, ['author'], async () => true)).resolves.toBe(
    true,
  );
});
it('does not infer AI authority from old v1 grants', async () => {
  const f = await fixture();
  const legacy = await f.trust.grant(f.binding, ['inspect', 'author'], 'autonomous', {
    scopes: ['manage-settings'],
  });
  expect(await f.grants.lookup(f.binding)).toBeUndefined();
  await expect(f.grants.check(f.binding, authorization(legacy), ['use-connected-ai'])).rejects.toMatchObject({
    code: 'GRANT_REVOKED',
  });
  expect((await f.settings.read()).agentGrants).toBeUndefined();
});
it('inspection grants no writing, AI, research or import scopes', async () => {
  const f = await fixture();
  const result = await f.grants.confirmPreset(
    f.binding,
    'inspection',
    await f.grants.issueNativeConfirmation(f.binding, 'inspection'),
  );
  expect(result.trustGrant.scopes).toEqual(['inspect']);
  expect(result.agentGrant.scopes).toEqual([]);
  await expect(
    f.grants.check(f.binding, authorization(result.agentGrant), ['use-connected-ai']),
  ).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
  await expect(
    f.trust.withAuthorization(f.binding, result.trustGrant, ['author'], async () => true),
  ).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
});
it('binds consumable native confirmation to store, root, preset and settings generation', async () => {
  const f = await fixture();
  const token = await f.grants.issueNativeConfirmation(f.binding, 'recommended');
  await expect(
    new AgentGrantStore(f.settings).confirmPreset(f.binding, 'recommended', token),
  ).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
  await expect(
    f.grants.confirmPreset({ ...f.binding, projectId: 'other' }, 'recommended', token),
  ).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
  await expect(f.grants.confirmPreset(f.binding, 'recommended', token)).rejects.toMatchObject({
    code: 'SCOPE_DENIED',
  });
  const changed = await f.grants.issueNativeConfirmation(f.binding, 'recommended');
  await f.settings.update((state) => {
    state.updates.offline = true;
  });
  await expect(f.grants.confirmPreset(f.binding, 'recommended', changed)).rejects.toMatchObject({
    code: 'GRANT_REVOKED',
  });
  const wrongPreset = await f.grants.issueNativeConfirmation(f.binding, 'inspection');
  await expect(f.grants.confirmPreset(f.binding, 'recommended', wrongPreset)).rejects.toMatchObject({
    code: 'SCOPE_DENIED',
  });
  const fresh = await f.grants.issueNativeConfirmation(f.binding, 'recommended');
  await f.grants.confirmPreset(f.binding, 'recommended', fresh);
  await expect(f.grants.confirmPreset(f.binding, 'recommended', fresh)).rejects.toMatchObject({
    code: 'SCOPE_DENIED',
  });
});
it('rejects wrong root identity, stale generation and ordinary grant revocation', async () => {
  const f = await fixture();
  const pair = await recommended(f);
  const auth = authorization(pair.agentGrant);
  for (const binding of [
    { ...f.binding, canonicalPath: join(f.config, 'other') },
    { ...f.binding, device: '999' },
    { ...f.binding, fileId: '999' },
    { ...f.binding, projectId: 'other' },
  ]) {
    await expect(f.grants.check(binding, auth, ['public-research'])).rejects.toMatchObject({
      code: 'GRANT_REVOKED',
    });
  }
  await expect(
    f.grants.check(f.binding, { ...auth, generation: 0 }, ['public-research']),
  ).rejects.toMatchObject({ code: 'GRANT_REVOKED' });
  await f.trust.revoke(pair.trustGrant.grantId, { scopes: ['manage-settings'] });
  await expect(f.grants.check(f.binding, auth, ['public-research'])).rejects.toMatchObject({
    code: 'GRANT_REVOKED',
  });
});
it('revokes both records atomically and replacing a preset invalidates prior AI authority', async () => {
  const f = await fixture();
  const old = await recommended(f);
  const replacement = await recommended(f);
  await expect(
    f.grants.check(f.binding, authorization(old.agentGrant), ['public-research']),
  ).rejects.toMatchObject({ code: 'GRANT_REVOKED' });
  await f.grants.revoke(f.binding, await f.grants.issueNativeConfirmation(f.binding, 'revoke'));
  const disk = await f.settings.read();
  expect(disk.generation).toBe(3);
  expect(disk.agentGrants!.every((grant) => grant.revokedAt !== null)).toBe(true);
  expect(disk.grants.every((grant) => grant.revokedAt !== null)).toBe(true);
  expect(await f.grants.lookup(f.binding)).toBeUndefined();
  await expect(
    f.grants.check(f.binding, authorization(replacement.agentGrant), ['public-research']),
  ).rejects.toMatchObject({ code: 'GRANT_REVOKED' });
});
it('rejects malformed settings scopes, injected credential fields and malformed authorization', async () => {
  const f = await fixture();
  const { agentGrant } = await recommended(f);
  const before = await readFile(join(f.config, 'settings.json'), 'utf8');
  for (const field of [
    { secret: 'private-marker' },
    { scopes: ['author'] },
    { scopes: ['public-research', 'public-research'] },
  ]) {
    await expect(
      f.settings.update((state) => {
        Object.assign(state.agentGrants![0]!, field);
      }),
    ).rejects.toMatchObject({ code: 'SETTINGS_INVALID' });
    expect(await readFile(join(f.config, 'settings.json'), 'utf8')).toBe(before);
  }
  await expect(
    f.grants.check(f.binding, { ...authorization(agentGrant), actor: 'agent' } as never, ['public-research']),
  ).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
});
it('expires confirmation without writing and consumes failed persistence attempts', async () => {
  const f = await fixture();
  const token = await f.grants.issueNativeConfirmation(f.binding, 'recommended');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
  await expect(f.grants.confirmPreset(f.binding, 'recommended', token)).rejects.toMatchObject({
    code: 'SCOPE_DENIED',
  });
  clock.mockRestore();
  const fresh = await f.grants.issueNativeConfirmation(f.binding, 'recommended');
  const update = vi.spyOn(f.settings, 'update').mockRejectedValueOnce(new Error('disk unavailable'));
  await expect(f.grants.confirmPreset(f.binding, 'recommended', fresh)).rejects.toThrow('disk unavailable');
  update.mockRestore();
  expect((await f.settings.read()).grants).toEqual([]);
  expect((await f.settings.read()).agentGrants).toBeUndefined();
  await expect(f.grants.confirmPreset(f.binding, 'recommended', fresh)).rejects.toMatchObject({
    code: 'SCOPE_DENIED',
  });
});
it('holds authority stable through the bounded action while revocation waits', async () => {
  const f = await fixture();
  const { agentGrant } = await recommended(f);
  const revokeToken = await f.grants.issueNativeConfirmation(f.binding, 'revoke');
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const action = f.grants.withAuthorization(
    f.binding,
    authorization(agentGrant),
    ['public-research'],
    async (grant) => {
      enter();
      await held;
      return grant.generation;
    },
  );
  await entered;
  const revoke = f.grants.revoke(f.binding, revokeToken);
  release();
  expect(await action).toBe(agentGrant.generation);
  await revoke;
  await expect(
    f.grants.check(f.binding, authorization(agentGrant), ['public-research']),
  ).rejects.toMatchObject({ code: 'GRANT_REVOKED' });
});

it('records paired AI revocation in the audit trail when legacy trust authority is revoked, regranted or forgotten', async () => {
  const f = await fixture();
  const first = await recommended(f);
  await f.trust.revoke(first.trustGrant.grantId, { scopes: ['manage-settings'] });
  let state = await f.settings.read();
  expect(state.agentGrants?.find((grant) => grant.grantId === first.agentGrant.grantId)?.revokedAt).not.toBeNull();
  const second = await recommended(f);
  await f.trust.grant(f.binding, ['inspect', 'author'], 'autonomous', { scopes: ['manage-settings'] });
  state = await f.settings.read();
  expect(state.agentGrants?.find((grant) => grant.grantId === second.agentGrant.grantId)?.revokedAt).not.toBeNull();
  expect(await f.grants.lookup(f.binding)).toBeUndefined();
  await f.trust.forget(f.binding, { scopes: ['manage-settings'] });
  state = await f.settings.read();
  expect((state.agentGrants ?? []).filter((grant) => grant.binding.projectId === f.binding.projectId)).toEqual([]);
});
