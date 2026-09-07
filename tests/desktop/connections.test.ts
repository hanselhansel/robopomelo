import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CredentialStore } from '../../apps/desktop/src/credential-store.js';
import type { EncryptionProvider } from '../../apps/desktop/src/credential-encryption.js';
import { ConnectionManager } from '../../apps/desktop/src/connections.js';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close(); });
const fake = (available = true): EncryptionProvider => ({
  isAvailable: async () => available,
  encrypt: async text => Buffer.from(Buffer.from(text).toString('base64')),
  decrypt: async bytes => ({ result: Buffer.from(bytes.toString(), 'base64').toString(), shouldReEncrypt: false }),
});
async function setup(available = true) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'rp-connections-')));
  cleanup.push(() => rm(parent, { recursive: true, force: true }));
  const credentials = await CredentialStore.open(join(parent, 'credentials'), fake(available));
  cleanup.push(() => credentials.close());
  const signIn = vi.fn(<T,>(_route: 'openrouter', sink: (secret: string) => Promise<T>) => sink('sk-or-test-secret'));
  const manager = new ConnectionManager(credentials, { connect: signIn as ConstructorParameters<typeof ConnectionManager>[1]['connect'], close: async () => {} });
  return { credentials, manager, signIn };
}
it('connects through the sign-in flow, exposes metadata only, and serves secrets to the broker alone', async () => {
  const f = await setup();
  const status = await f.manager.connect('openrouter');
  expect(status).toMatchObject({ route: 'openrouter', state: 'connected', generation: 1 });
  expect(JSON.stringify(status)).not.toContain('sk-or');
  expect(JSON.stringify(await f.manager.statuses())).not.toContain('sk-or');
  const listed = await f.manager.list();
  expect(listed).toEqual([{ connectionId: status.connectionId, route: 'openrouter', label: 'OpenRouter', generation: 1 }]);
  expect(await f.manager.secret(status.connectionId)).toBe('sk-or-test-secret');
  expect(await f.manager.status(status.connectionId)).toMatchObject({ state: 'connected', accountLabel: 'OpenRouter' });
});
it('disconnects by deleting the credential and bumps generation so stale selections cannot dispatch', async () => {
  const f = await setup();
  const status = await f.manager.connect('openrouter');
  const after = await f.manager.disconnect(status.connectionId);
  expect(after).toMatchObject({ connectionId: status.connectionId, state: 'disconnected', generation: 2 });
  expect(await f.manager.list()).toEqual([]);
  await expect(f.manager.secret(status.connectionId)).rejects.toThrow();
  expect(await f.manager.status(status.connectionId)).toMatchObject({ state: 'disconnected' });
});
it('marks a connection disabled-cleanup-required when local deletion fails and never re-enables it silently', async () => {
  const f = await setup();
  const status = await f.manager.connect('openrouter');
  vi.spyOn(f.credentials, 'remove').mockRejectedValueOnce(new Error('EIO'));
  const failed = await f.manager.disconnect(status.connectionId);
  expect(failed.state).toBe('disabled-cleanup-required');
  expect(await f.manager.list()).toEqual([]);
  await expect(f.manager.secret(status.connectionId)).rejects.toMatchObject({ code: 'CONNECTION_DISABLED' });
  expect((await f.manager.statuses()).map(s => s.state)).toEqual(['disabled-cleanup-required']);
  const retried = await f.manager.disconnect(status.connectionId);
  expect(retried.state).toBe('disconnected');
  expect(await f.manager.statuses()).toEqual([]);
});
it('reports no connections when machine encryption is unavailable instead of failing the app', async () => {
  const f = await setup(false);
  expect(await f.manager.list()).toEqual([]);
  expect(await f.manager.statuses()).toEqual([]);
  await expect(f.manager.connect('openrouter')).rejects.toMatchObject({ code: 'CREDENTIAL_ENCRYPTION_UNAVAILABLE' });
});
