import { setTimeout } from 'node:timers/promises';
import { ProjectFsError } from '../errors.js';
import { currentOwner, ownerLiveness, parseOwner } from './owner.js';
import type { LockOwner } from './owner.js';
import type { SafeRoot, SafeStat } from './safe-fs.js';

export type LockKind = 'project'|'settings';
export interface LockLease {readonly nonce:string; assertHeld():Promise<void>; release():Promise<void>}
interface Record {directory:SafeStat; file:SafeStat; owner:LockOwner}
const same = (a:SafeStat,b:SafeStat) => a.device === b.device && a.fileId === b.fileId;
const locked = ():never => {throw new ProjectFsError('LOCKED','Project or settings lock is held or ownership is uncertain. Retry after the current operation finishes.');};
const missing = (error:unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

async function exists(root:SafeRoot,path:string):Promise<boolean> {
  try {await root.stat(path); return true;} catch (error) {if (missing(error)) return false; throw error;}
}
async function read(root:SafeRoot,path:string):Promise<Record> {
  const directory = await root.stat(path);
  const handle = await root.openRead(`${path}/owner.json`);
  try {
    const file = await handle.stat();
    const owner = parseOwner((await handle.readFile(16 * 1024)).toString('utf8'));
    const identity = root.identity();
    if (owner.root.canonicalPath !== identity.canonicalPath || owner.root.fileId !== identity.fileId || owner.root.device !== identity.device) return locked();
    return {directory,file,owner};
  } finally {await handle.close();}
}
async function assertRecord(root:SafeRoot,path:string,record:Record):Promise<void> {
  let current:Record;
  try {current = await read(root,path);} catch {throw new ProjectFsError('LOCK_CHANGED','Lock ownership can no longer be verified.');}
  if (!same(record.directory,current.directory) || !same(record.file,current.file) || record.owner.nonce !== current.owner.nonce) throw new ProjectFsError('LOCK_CHANGED','Lock ownership changed.');
}
async function release(root:SafeRoot,path:string,record:Record):Promise<void> {
  await assertRecord(root,path,record);
  await root.removeOwnedEntry(`${path}/owner.json`,record.file);
  await root.removeOwnedEntry(path,record.directory);
}
async function initialize(root:SafeRoot,path:string):Promise<Record> {
  await root.mkdir(path);
  const owner = await currentOwner(root.identity());
  const file = await root.createExclusive(`${path}/owner.json`);
  try {await file.write(Buffer.from(JSON.stringify(owner))); await file.sync();}
  finally {await file.close();}
  await root.fsyncDirectory(path);
  return read(root,path);
}
async function recover(root:SafeRoot,kind:LockKind):Promise<void> {
  const path = `.robopomelo-${kind}.lock`;
  const claimPath = `.robopomelo-${kind}.recovery`;
  let candidate:Record;
  try {candidate = await read(root,path);} catch {return locked();}
  if (await ownerLiveness(candidate.owner) !== 'absent') return locked();
  let claim:Record;
  try {claim = await initialize(root,claimPath);} catch (error) {if ((error as NodeJS.ErrnoException).code === 'EEXIST') return locked(); throw error;}
  try {
    await assertRecord(root,claimPath,claim);
    await assertRecord(root,path,candidate);
    if (await ownerLiveness(candidate.owner) !== 'absent') return locked();
    await root.quarantineLock(kind,candidate.directory,claim.directory);
    await root.fsyncDirectory();
  } finally {await release(root,claimPath,claim);}
}
async function attempt(root:SafeRoot,kind:LockKind):Promise<LockLease> {
  const path = `.robopomelo-${kind}.lock`;
  const claimPath = `.robopomelo-${kind}.recovery`;
  if (await exists(root,claimPath)) return locked();
  let record:Record;
  try {record = await initialize(root,path);}
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    await recover(root,kind);
    if (await exists(root,claimPath)) return locked();
    try {record = await initialize(root,path);} catch (next) {if ((next as NodeJS.ErrnoException).code === 'EEXIST') return locked(); throw next;}
  }
  if (await exists(root,claimPath)) {await release(root,path,record); return locked();}
  let released = false;
  return Object.freeze({
    nonce:record.owner.nonce,
    assertHeld:async () => {if (released) throw new ProjectFsError('LOCK_CHANGED','Lock lease was released.'); await assertRecord(root,path,record);},
    release:async () => {if (!released) {await release(root,path,record); released = true;}},
  });
}

export async function acquireLock(root:SafeRoot,kind:LockKind = 'project',options:{timeoutMs?:number; signal?:AbortSignal} = {}):Promise<LockLease> {
  if (kind !== 'project' && kind !== 'settings') throw new ProjectFsError('INVALID_LOCK','Only fixed project and settings lock namespaces are supported.');
  const timeout = options.timeoutMs ?? 0;
  if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 60_000) throw new ProjectFsError('INVALID_LIMIT','Lock timeout must be between zero and sixty seconds.');
  const until = Date.now() + timeout;
  while (true) {
    options.signal?.throwIfAborted();
    try {return await attempt(root,kind);}
    catch (error) {
      if ((error as {code?:string}).code !== 'LOCKED' || Date.now() >= until) throw error;
      await setTimeout(Math.min(25,Math.max(1,until-Date.now())),undefined,{signal:options.signal});
    }
  }
}
