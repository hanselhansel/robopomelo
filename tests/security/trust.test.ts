import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, realpath, lstat, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore } from '../../packages/project-fs/src/settings/store.js';
import { TrustStore } from '../../packages/project-fs/src/settings/trust.js';
import { machinePaths } from '../../packages/project-fs/src/fs/machine-paths.js';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
import { UpdatePreferences } from '../../packages/project-fs/src/settings/updates.js';
import { build } from 'esbuild';
import { fork } from 'node:child_process';
import { once } from 'node:events';

const cleanup:(() => Promise<unknown>)[] = [];
const authority = {scopes:['manage-settings'] as const};
let executable:string;
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(),'rp-settings-worker-'));
  executable = join(directory,'child.mjs');
  await build({entryPoints:[new URL('../runtime/helpers/settings-child.ts',import.meta.url).pathname],outfile:executable,bundle:true,platform:'node',format:'esm'});
  return async () => {await rm(directory,{recursive:true,force:true});};
});
async function fixture() {
  const base = await realpath(await mkdtemp(join(tmpdir(),'rp-trust-')));
  const config = join(base,'config'); const project = join(base,'project'); await mkdir(project);
  const root = await SafeRoot.open(project);
  cleanup.push(async () => {await root.close(); await rm(base,{recursive:true,force:true});});
  const binding = {...root.identity(),projectId:'project-1'};
  const settings = new SettingsStore(config); const trust = new TrustStore(settings);
  return {base,config,project,root,binding,settings,trust};
}
afterEach(async () => {for (const fn of cleanup.splice(0).reverse()) await fn();});

describe('machine-local settings and trust', () => {
  it('reads defaults and shows trust without creating configuration', async () => {
    const {config,settings,trust,binding} = await fixture();
    expect((await settings.read()).version).toBe(1);
    expect(await trust.lookup(binding)).toBeUndefined();
    expect(await trust.show(binding)).toEqual([]);
    await expect(lstat(config)).rejects.toMatchObject({code:'ENOENT'});
    expect(machinePaths({root:config}).config).toBe(join(config,'config'));
    await expect(lstat(config)).rejects.toMatchObject({code:'ENOENT'});
  });
  it('requires explicit manage-settings authority and keeps scopes distinct', async () => {
    const {trust,binding} = await fixture();
    await expect(trust.grant(binding,['author'],'autonomous',{scopes:['author']})).rejects.toMatchObject({code:'SCOPE_DENIED'});
    const grant = await trust.grant(binding,['inspect','author'],'autonomous',authority);
    expect(await trust.lookup(binding)).toEqual(grant);
    await expect(trust.withAuthorization(binding,grant,['record-decisions'],async () => 'forbidden')).rejects.toMatchObject({code:'SCOPE_DENIED'});
    expect(await trust.withAuthorization(binding,grant,['author'],async () => 'allowed')).toBe('allowed');
  });
  it('does not trust copied, moved, replaced or different-ID projects', async () => {
    const {base,trust,binding} = await fixture();
    await trust.grant(binding,['author'],'review-each-change',authority);
    const copy = join(base,'copy'); await mkdir(copy); const copiedRoot = await SafeRoot.open(copy);
    try {expect(await trust.lookup({...copiedRoot.identity(),projectId:binding.projectId})).toBeUndefined();} finally {await copiedRoot.close();}
    expect(await trust.lookup({...binding,canonicalPath:copy})).toBeUndefined();
    expect(await trust.lookup({...binding,fileId:'987654321'})).toBeUndefined();
    expect(await trust.lookup({...binding,projectId:'another-project'})).toBeUndefined();
  });
  it('rechecks queued authorization after revocation and retains a tombstone', async () => {
    const {trust,binding} = await fixture();
    const grant = await trust.grant(binding,['author'],'autonomous',authority);
    await trust.revoke(grant.grantId,authority);
    await expect(trust.withAuthorization(binding,grant,['author'],async () => 'commit')).rejects.toMatchObject({code:'GRANT_REVOKED'});
    const status = (await trust.show(binding))[0]!;
    expect(status.generation).toBeGreaterThan(grant.generation);
    expect(status.revokedAt).not.toBeNull();
  });
  it('holds the settings lock through authorized replacement, serializing completed revocation', async () => {
    const {trust,binding} = await fixture();
    const grant = await trust.grant(binding,['author'],'autonomous',authority);
    let enter!:() => void; const entered = new Promise<void>(resolve => {enter=resolve;});
    let finish!:() => void; const held = new Promise<void>(resolve => {finish=resolve;});
    const order:string[] = [];
    const commit = trust.withAuthorization(binding,grant,['author'],async () => {enter(); await held; order.push('commit');});
    await entered;
    const revoke = trust.revoke(grant.grantId,authority).then(() => {order.push('revoke');});
    finish(); await Promise.all([commit,revoke]);
    expect(order).toEqual(['commit','revoke']);
    await expect(trust.withAuthorization(binding,grant,['author'],async () => {})).rejects.toMatchObject({code:'GRANT_REVOKED'});
  });
  it('keeps explicit per-run authorization in memory and invalidates it on revocation', async () => {
    const {trust,settings,binding,config} = await fixture();
    const grant = trust.authorizeRun(binding,['author'],'autonomous');
    expect(await trust.withAuthorization(binding,grant,['author'],async () => 'ok')).toBe('ok');
    expect((await settings.read()).grants).toEqual([]);
    await expect(lstat(config)).rejects.toMatchObject({code:'ENOENT'});
    await trust.revokeRun(grant.grantId);
    await expect(trust.withAuthorization(binding,grant,['author'],async () => {})).rejects.toMatchObject({code:'GRANT_REVOKED'});
  });
  it('forgets remembered authority without touching project files', async () => {
    const {trust,binding,project} = await fixture(); await writeFile(join(project,'source'),'project source');
    const grant = await trust.grant(binding,['author'],'autonomous',authority);
    await trust.forget(binding,authority);
    expect(await trust.show(binding)).toEqual([]);
    await expect(trust.withAuthorization(binding,grant,['author'],async () => {})).rejects.toMatchObject({code:'GRANT_REVOKED'});
    expect(await readFile(join(project,'source'),'utf8')).toBe('project source');
  });
  it('preserves prior configuration bytes and ignores an interrupted staged candidate', async () => {
    const {config,settings,trust,binding} = await fixture();
    await trust.grant(binding,['inspect'],'autonomous',authority);
    const before = await readFile(join(config,'settings.json'),'utf8');
    await settings.update(draft => {draft.updates.offline = true;});
    const backup = (await readdir(config)).find(name => name.startsWith('settings.previous-'))!;
    expect(await readFile(join(config,backup),'utf8')).toBe(before);
    await writeFile(join(config,'.settings-interrupted.tmp'),'{incomplete');
    expect((await settings.read()).updates.offline).toBe(true);
    if (process.platform !== 'win32') expect((await lstat(join(config,'settings.json'))).mode & 0o777).toBe(0o600);
  });
  it('rejects malformed settings and config links without restoring old authority automatically', async () => {
    const {base,config,settings,trust,binding} = await fixture();
    const grant = await trust.grant(binding,['author'],'autonomous',authority);
    await writeFile(join(config,'settings.json'),'{}');
    await expect(settings.read()).rejects.toMatchObject({code:'SETTINGS_INVALID'});
    await expect(trust.withAuthorization(binding,grant,['author'],async () => {})).rejects.toMatchObject({code:'SETTINGS_INVALID'});
    const linked = join(base,'linked'); await symlink(config,linked,process.platform === 'win32'?'junction':'dir');
    await expect(new SettingsStore(linked).read()).rejects.toMatchObject({code:'PATH_ESCAPE'});
  });
  it('preserves canonical settings after an OS process dies holding an unfinished update', async () => {
    const {config,settings,trust,binding} = await fixture();
    await trust.grant(binding,['inspect'],'autonomous',authority);
    const before = await readFile(join(config,'settings.json'),'utf8');
    const worker = fork(executable,[config],{stdio:['ignore','ignore','inherit','ipc']});
    cleanup.push(async () => {if (worker.exitCode === null && worker.signalCode === null) {const done = once(worker,'exit'); worker.kill('SIGKILL'); await done;}});
    await once(worker,'message'); const held = once(worker,'message'); worker.send('hold'); await held;
    const stopped = once(worker,'exit'); worker.kill('SIGKILL'); await stopped;
    expect(await readFile(join(config,'settings.json'),'utf8')).toBe(before);
    await settings.update(draft => {draft.updates.automatic = false;});
    expect((await settings.read()).updates).toMatchObject({automatic:false,offline:false});
  });
  it('requires settings authority for update preferences and preserves invalid-input recovery', async () => {
    const {settings} = await fixture(); const updates = new UpdatePreferences(settings);
    expect((await updates.read()).automatic).toBe(true);
    await expect(updates.configure({offline:true},{scopes:['author']})).rejects.toMatchObject({code:'SCOPE_DENIED'});
    expect(await updates.configure({offline:true,pinnedVersion:'1.2.3'},authority)).toMatchObject({offline:true,pinnedVersion:'1.2.3'});
    await expect(updates.configure({pinnedVersion:'latest'},authority)).rejects.toMatchObject({code:'SETTINGS_INVALID'});
    expect((await updates.read()).pinnedVersion).toBe('1.2.3');
  });
  it.runIf(process.platform === 'win32')('compares canonical Windows paths without case-induced false trust changes', async () => {
    const {trust,binding} = await fixture(); const grant = await trust.grant(binding,['inspect'],'autonomous',authority);
    expect(await trust.lookup({...binding,canonicalPath:binding.canonicalPath.toUpperCase()})).toEqual(grant);
  });
});
