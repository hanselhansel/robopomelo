import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { build } from 'esbuild';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
import { acquireLock } from '../../packages/project-fs/src/fs/lock.js';
import { currentOwner, ownerLiveness, parseOwner } from '../../packages/project-fs/src/fs/owner.js';

const cleanup:(() => Promise<unknown>)[] = [];
let executable:string;
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(),'rp-lock-worker-'));
  executable = join(directory,'child.mjs');
  await build({entryPoints:[new URL('./helpers/lock-child.ts',import.meta.url).pathname],outfile:executable,bundle:true,platform:'node',format:'esm'});
  return async () => {await rm(directory,{recursive:true,force:true});};
});
afterEach(async () => {for (const fn of cleanup.splice(0).reverse()) await fn();});
async function fixture() {
  const path = await mkdtemp(join(tmpdir(),'rp-lock-'));
  const root = await SafeRoot.open(path);
  cleanup.push(async () => {await root.close(); await rm(path,{recursive:true,force:true});});
  return {path,root};
}
async function child(path:string) {
  const process = fork(executable,[path],{stdio:['ignore','ignore','inherit','ipc']});
  cleanup.push(async () => {if (process.exitCode === null && process.signalCode === null) {const done = once(process,'exit'); process.kill('SIGKILL'); await done;}});
  await once(process,'message');
  return process;
}
async function command(process:ChildProcess,command:string):Promise<{status:string;code?:string}> {
  const result = once(process,'message'); process.send(command); return (await result)[0];
}
async function kill(process:ChildProcess) {const done = once(process,'exit'); process.kill('SIGKILL'); await done;}

describe('cooperative identity-bound locks', () => {
  it('admits only one of two real OS processes and allows a later owner', async () => {
    const {path,root} = await fixture(); const a = await child(path); const b = await child(path);
    const results = await Promise.all([command(a,'acquire'),command(b,'acquire')]);
    expect(results.map(r => r.status).sort()).toEqual(['acquired','error']);
    expect(results.find(r => r.status === 'error')?.code).toBe('LOCKED');
    await command(results[0]?.status === 'acquired'?a:b,'release');
    const lease = await acquireLock(root); await lease.assertHeld(); await lease.release();
  });
  it('recovers a provably dead child under a separate claim and retains quarantine', async () => {
    const {path,root} = await fixture(); const holder = await child(path);
    expect(await command(holder,'acquire')).toEqual({status:'acquired'}); await kill(holder);
    const lease = await acquireLock(root);
    expect((await root.list()).some(name => name.startsWith('.robopomelo-project.quarantine-'))).toBe(true);
    await lease.release();
  });
  it('arbitrates stale recovery against a fresh competing process', async () => {
    const {path,root} = await fixture(); const dead = await child(path);
    await command(dead,'acquire'); await kill(dead);
    const contender = await child(path);
    const [local,remote] = await Promise.all([acquireLock(root).then(lease => ({lease}),error => ({error})),command(contender,'acquire')]);
    expect(('lease' in local ? 1 : 0)+(remote.status === 'acquired'?1:0)).toBeLessThanOrEqual(1);
    if ('lease' in local) await local.lease.release();
    if (remote.status === 'acquired') await command(contender,'release');
    const final = await acquireLock(root); await final.release();
  });
  it.each(['missing','malformed','foreign','live-old','claim'])('never steals an uncertain %s lock', async kind => {
    const {path,root} = await fixture();
    const dir = kind === 'claim'?'.robopomelo-project.recovery':'.robopomelo-project.lock';
    await mkdir(join(path,dir));
    if (kind !== 'missing' && kind !== 'claim') {
      const owner = await currentOwner(root.identity());
      if (kind === 'foreign') owner.hostname = 'another-host';
      owner.createdAt = '2000-01-01T00:00:00.000Z';
      await writeFile(join(path,dir,'owner.json'),kind === 'malformed'?'not json':JSON.stringify(owner));
    }
    await expect(acquireLock(root)).rejects.toMatchObject({code:'LOCKED'});
  });
  it('refuses release after its owner nonce was replaced', async () => {
    const {path,root} = await fixture(); const lease = await acquireLock(root);
    const file = join(path,'.robopomelo-project.lock','owner.json');
    const owner = JSON.parse(await readFile(file,'utf8')); owner.nonce = 'a'.repeat(64);
    await writeFile(file,JSON.stringify(owner));
    await expect(lease.release()).rejects.toMatchObject({code:'LOCK_CHANGED'});
    expect(await readFile(file,'utf8')).toContain(owner.nonce);
  });
  it('records current process identity and treats a live PID as locked even if its marker differs', async () => {
    const {root} = await fixture(); const owner = await currentOwner(root.identity());
    expect(parseOwner(JSON.stringify(owner))).toEqual(owner);
    expect(owner.nonce).toMatch(/^[a-f0-9]{64}$/);
    owner.processStart = 'different marker';
    expect(await ownerLiveness(owner)).toBe('alive');
    expect(() => parseOwner('{}')).toThrow();
  });
  it('does not accept caller-selected lock namespaces or remove substituted entries', async () => {
    const {path,root} = await fixture();
    await expect(acquireLock(root,'other' as never)).rejects.toMatchObject({code:'INVALID_LOCK'});
    const handle = await root.createExclusive('owned'); await handle.close();
    const identity = await root.stat('owned');
    await rename(join(path,'owned'),join(path,'saved')); await writeFile(join(path,'owned'),'replacement');
    await expect(root.removeOwnedEntry('owned',identity)).rejects.toMatchObject({code:'PATH_CHANGED'});
    expect(await readFile(join(path,'owned'),'utf8')).toBe('replacement');
  });
});
