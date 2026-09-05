import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ProjectFsError } from '../errors.js';
import type { RootIdentity } from './safe-fs.js';

export interface LockOwner {
  version:1; nonce:string; pid:number; hostname:string; bootId:string|null;
  processStart:string|null; root:RootIdentity; createdAt:string;
}
const execute = promisify(execFile);
let boot:Promise<string|null>|undefined;
async function bootIdentity():Promise<string|null> {
  boot ??= (async () => {
    try {
      if (process.platform === 'linux') return (await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim();
      if (process.platform === 'darwin') return (await execute('/usr/sbin/sysctl',['-n','kern.boottime'],{timeout:2000,maxBuffer:4096})).stdout.trim();
    } catch { /* Unavailable markers remain explicitly unknown. */ }
    return null;
  })();
  return boot;
}
async function processStart(pid:number):Promise<string|null> {
  try {
    if (process.platform === 'linux') {
      const text = await readFile(`/proc/${pid}/stat`,'utf8');
      return text.slice(text.lastIndexOf(')')+2).split(' ')[19] ?? null;
    }
    if (process.platform === 'darwin') return (await execute('/bin/ps',['-p',String(pid),'-o','lstart='],{timeout:2000,maxBuffer:4096})).stdout.trim() || null;
  } catch { /* PID liveness remains authoritative for conservative locking. */ }
  return null;
}

export async function currentOwner(root:RootIdentity):Promise<LockOwner> {
  return {version:1,nonce:randomBytes(32).toString('hex'),pid:process.pid,hostname:hostname(),bootId:await bootIdentity(),processStart:await processStart(process.pid),root:{...root},createdAt:new Date().toISOString()};
}

export function parseOwner(text:string):LockOwner {
  const invalid = ():never => {throw new ProjectFsError('LOCKED','Lock ownership is malformed or uncertain. Inspect it before recovery.');};
  if (Buffer.byteLength(text) > 16 * 1024) return invalid();
  let owner:unknown;
  try {owner = JSON.parse(text);} catch {return invalid();}
  if (!owner || typeof owner !== 'object' || Array.isArray(owner)) return invalid();
  const o = owner as Record<string,unknown>;
  if (Object.keys(o).sort().join(',') !== 'bootId,createdAt,hostname,nonce,pid,processStart,root,version') return invalid();
  if (o.version !== 1 || typeof o.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(o.nonce) || !Number.isSafeInteger(o.pid) || Number(o.pid) < 1 || typeof o.hostname !== 'string' || !o.hostname || o.hostname.length > 255 || typeof o.createdAt !== 'string' || !Number.isFinite(Date.parse(o.createdAt))) return invalid();
  for (const value of [o.bootId,o.processStart]) if (value !== null && (typeof value !== 'string' || !value || value.length > 1024)) return invalid();
  if (!o.root || typeof o.root !== 'object' || Array.isArray(o.root)) return invalid();
  const root = o.root as Record<string,unknown>;
  if (Object.keys(root).sort().join(',') !== 'canonicalPath,device,fileId' || Object.values(root).some(value => typeof value !== 'string' || !value)) return invalid();
  return owner as LockOwner;
}

export async function ownerLiveness(owner:LockOwner):Promise<'alive'|'absent'|'uncertain'|'foreign'> {
  if (owner.hostname !== hostname()) return 'foreign';
  const localBoot = await bootIdentity();
  if (owner.bootId !== null && localBoot !== null && owner.bootId !== localBoot) return 'uncertain';
  try {process.kill(owner.pid,0); return 'alive';}
  catch (error) {return (error as NodeJS.ErrnoException).code === 'ESRCH'?'absent':'uncertain';}
}
