import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CredentialStore } from '../../apps/desktop/src/credential-store.js';
import { createMacOSEncryptionProvider, type EncryptionProvider } from '../../apps/desktop/src/credential-encryption.js';

const marker = 'credential-secret-marker-DO-NOT-PERSIST';
const roots:string[] = [];
const stores:CredentialStore[] = [];
// Reversible fixture encoding, deliberately NOT cryptographic acceptance.
function fake():EncryptionProvider {
  return {
    isAvailable:async () => true,
    encrypt:async text => Buffer.from(Buffer.from(text).toString('base64')),
    decrypt:async bytes => ({result:Buffer.from(bytes.toString(),'base64').toString(),shouldReEncrypt:false}),
  };
}
async function setup(encryption = fake()) {
  const parent = await realpath(await mkdtemp(join(tmpdir(),'rp-credentials-'))); roots.push(parent);
  const directory = join(parent,'machine','credentials');
  const store = await CredentialStore.open(directory,encryption); stores.push(store);
  return {store,directory,encryption,parent};
}
afterEach(async () => {
  await Promise.all(stores.splice(0).map(s => s.close()));
  await Promise.all(roots.splice(0).map(p => rm(p,{recursive:true,force:true})));
});

describe('machine credential storage', () => {
  it('persists only encrypted records with opaque metadata and owner-only permissions', async () => {
    const {store,directory,encryption} = await setup();
    const meta = await store.create('openrouter',marker,'Work account');
    expect(meta).toEqual({id:expect.stringMatching(/^connection-[a-f0-9-]{36}$/),provider:'openrouter',label:'Work account',createdAt:expect.any(String)});
    expect(await store.getSecret(meta.id)).toBe(marker);
    expect(await store.list()).toEqual([meta]);
    expect(JSON.stringify(await store.list())).not.toContain(marker);
    expect((await lstat(directory)).mode & 0o777).toBe(0o700);
    for (const file of await readdir(directory)) {
      expect((await readFile(join(directory,file))).includes(Buffer.from(marker))).toBe(false);
      expect((await lstat(join(directory,file))).mode & 0o777).toBe(0o600);
    }
    await store.close();
    const reopened = await CredentialStore.open(directory,encryption); stores.push(reopened);
    expect(await reopened.getSecret(meta.id)).toBe(marker);
    await reopened.remove(meta.id);
    expect(await reopened.list()).toEqual([]);
    expect(await readdir(directory)).toEqual([]);
    await expect(reopened.getSecret(meta.id)).rejects.toMatchObject({code:'CREDENTIAL_NOT_FOUND'});
  });

  it('rejects traversal, invalid providers, excessive inputs and secret-bearing labels', async () => {
    const {store,directory} = await setup();
    for (const id of ['../secret','connection-../../secret','x','CONNECTION-00000000-0000-4000-8000-000000000000']) {
      await expect(store.getSecret(id)).rejects.toMatchObject({code:'CREDENTIAL_INVALID'});
      await expect(store.remove(id)).rejects.toMatchObject({code:'CREDENTIAL_INVALID'});
    }
    for (const secret of ['', 'x'.repeat(16_385), 'x\0y']) await expect(store.create('codex',secret)).rejects.toMatchObject({code:'CREDENTIAL_INVALID'});
    await expect(store.create('unknown' as 'codex',marker)).rejects.toMatchObject({code:'CREDENTIAL_INVALID'});
    await expect(store.create('grok',marker,marker)).rejects.toMatchObject({code:'CREDENTIAL_INVALID'});
    expect(await readdir(directory)).toEqual([]);
  });

  it('denies symlinked or insecure machine directories and canonical traversal', async () => {
    const {parent} = await setup();
    const outside = join(parent,'outside'); await mkdir(outside,{mode:0o700});
    await symlink(outside,join(parent,'alias'));
    for (const directory of [join(parent,'alias','credentials'), `${parent}/outside/../credentials`, 'relative']) {
      await expect(CredentialStore.open(directory,fake())).rejects.toMatchObject({code:'CREDENTIAL_STORAGE_UNAVAILABLE'});
    }
    await chmod(outside,0o755);
    await expect(CredentialStore.open(outside,fake())).rejects.toMatchObject({code:'CREDENTIAL_STORAGE_UNAVAILABLE'});
  });

  it('rejects a filesystem root as the configured machine directory', async () => {
    const result = await CredentialStore.open('/',fake()).then(store => {stores.push(store); return store;}).catch(error => error);
    expect(result).toMatchObject({code:'CREDENTIAL_STORAGE_UNAVAILABLE'});
  });

  it('rejects portable project ancestors and readable credential files', async () => {
    const {store,directory,parent} = await setup();
    const meta = await store.create('codex',marker);
    await chmod(join(directory,`${meta.id}.enc`),0o644);
    await expect(store.getSecret(meta.id)).rejects.toMatchObject({code:'CREDENTIAL_INVALID'});
    await writeFile(join(parent,'deployment.yaml'),'formatVersion: 1');
    await expect(store.list()).rejects.toMatchObject({code:'CREDENTIAL_STORAGE_UNAVAILABLE'});
    await expect(CredentialStore.open(join(parent,'another-machine-store'),fake())).rejects.toMatchObject({code:'CREDENTIAL_STORAGE_UNAVAILABLE'});
  });

  it('cleans encrypted crash remnants and preserves the old record if rotation fails', async () => {
    const encryption = fake(); const {store,directory} = await setup(encryption);
    const meta = await store.create('openrouter',marker);
    const file = join(directory,`${meta.id}.enc`); const before = await readFile(file);
    await writeFile(join(directory,'.credential-00000000-0000-4000-8000-000000000000.tmp'),before,{mode:0o600});
    const original = encryption.decrypt;
    encryption.decrypt = async bytes => ({...await original(bytes),shouldReEncrypt:true});
    encryption.encrypt = async () => {throw Object.assign(new Error(marker),{isTemporarilyUnavailable:true});};
    await expect(store.getSecret(meta.id)).rejects.toMatchObject({code:'CREDENTIAL_ENCRYPTION_UNAVAILABLE'});
    expect(await readFile(file)).toEqual(before);
    expect(await readdir(directory)).toEqual([`${meta.id}.enc`]);
    encryption.isAvailable = async () => false;
    await store.remove(meta.id);
    expect(await readdir(directory)).toEqual([]);
  });

  it('fails closed on unavailable encryption without persisting or leaking errors', async () => {
    const encryption = fake(); const {store,directory} = await setup(encryption);
    encryption.isAvailable = async () => false;
    await expect(store.create('openrouter',marker)).rejects.toMatchObject({code:'CREDENTIAL_ENCRYPTION_UNAVAILABLE'});
    expect(await readdir(directory)).toEqual([]);
    encryption.isAvailable = async () => true;
    encryption.encrypt = async () => {throw new Error(`${marker} at ${directory}`);};
    await expect(store.create('openrouter',marker)).rejects.toThrow('Credential operation failed.');
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects malformed ciphertext and symlink records without exposing filesystem data', async () => {
    const {store,directory,parent} = await setup(); const meta = await store.create('codex',marker);
    const file = join(directory,`${meta.id}.enc`);
    await writeFile(file,'malformed');
    await expect(store.getSecret(meta.id)).rejects.toMatchObject({code:'CREDENTIAL_INVALID'});
    await rm(file); const target = join(parent,'outside-secret'); await writeFile(target,marker);
    await symlink(target,file);
    await expect(store.getSecret(meta.id)).rejects.toThrow('Credential operation failed.');
    await expect(store.remove(meta.id)).rejects.toThrow('Credential operation failed.');
    expect(await readFile(target,'utf8')).toBe(marker);
  });

  it('serializes independent instances and removes durably without resurrecting records', async () => {
    const {store,directory,encryption} = await setup();
    const other = await CredentialStore.open(directory,encryption); stores.push(other);
    const metadata = await Promise.all(Array.from({length:8},(_,i) => (i % 2 ? other:store).create('grok',`${marker}-${i}`)));
    expect(new Set(metadata.map(m => m.id)).size).toBe(8);
    expect(await store.list()).toHaveLength(8);
    await Promise.all(metadata.map((m,i) => (i % 2 ? other:store).remove(m.id)));
    expect(await readdir(directory)).toEqual([]);
  });

  it('re-encrypts rotated records atomically and preserves records on temporary unavailability', async () => {
    const encryption = fake(); const {store,directory} = await setup(encryption);
    const meta = await store.create('openrouter',marker);
    const original = encryption.decrypt;
    encryption.decrypt = async bytes => ({...await original(bytes),shouldReEncrypt:true});
    const encrypt = vi.fn(encryption.encrypt); encryption.encrypt = encrypt;
    expect(await store.getSecret(meta.id)).toBe(marker); expect(encrypt).toHaveBeenCalledOnce();
    const before = await readFile(join(directory,`${meta.id}.enc`));
    encryption.decrypt = async () => {throw Object.assign(new Error(marker),{isTemporarilyUnavailable:true});};
    await expect(store.getSecret(meta.id)).rejects.toMatchObject({code:'CREDENTIAL_ENCRYPTION_UNAVAILABLE'});
    expect(await readFile(join(directory,`${meta.id}.enc`))).toEqual(before);
  });
});

describe('macOS asynchronous safeStorage adapter (injected fixture only)', () => {
  it('uses only asynchronous APIs and denies non-macOS without consulting the backend', async () => {
    const safe = {isAsyncEncryptionAvailable:vi.fn(async () => true),encryptStringAsync:vi.fn(async () => Buffer.from('cipher')),decryptStringAsync:vi.fn(async () => ({result:marker,shouldReEncrypt:true}))};
    const disabled = createMacOSEncryptionProvider(safe,'linux');
    expect(await disabled.isAvailable()).toBe(false);
    await expect(disabled.encrypt(marker)).rejects.toMatchObject({code:'CREDENTIAL_ENCRYPTION_UNAVAILABLE'});
    expect(safe.isAsyncEncryptionAvailable).not.toHaveBeenCalled();
    const provider = createMacOSEncryptionProvider(safe,'darwin');
    expect(await provider.encrypt(marker)).toEqual(Buffer.from('cipher'));
    expect(await provider.decrypt(Buffer.from('cipher'))).toEqual({result:marker,shouldReEncrypt:true});
    safe.isAsyncEncryptionAvailable.mockResolvedValue(false);
    await expect(provider.decrypt(Buffer.from('cipher'))).rejects.toMatchObject({code:'CREDENTIAL_ENCRYPTION_UNAVAILABLE'});
  });
});
