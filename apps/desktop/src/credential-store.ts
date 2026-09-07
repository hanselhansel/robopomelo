import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { acquireLock, machineDirectory, SafeRoot } from '@robopomelo/project-fs';
import { CredentialError, credentialError, type EncryptionProvider } from './credential-encryption.js';

export type ConnectionProvider = 'openrouter'|'codex'|'grok';
export interface ConnectionMetadata {id:string; provider:ConnectionProvider; label?:string; createdAt:string}
interface CredentialRecord extends ConnectionMetadata {formatVersion:1; secret:string}
const idPattern = /^connection-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const temporaryPattern = /^\.credential-[a-f0-9-]{36}\.tmp$/;
const maxCiphertext = 128 * 1024;
const invalid = ():never => {throw new CredentialError('CREDENTIAL_INVALID');};
function validId(id:string):void {if (typeof id !== 'string' || !idPattern.test(id)) invalid();}
function validInput(provider:ConnectionProvider,secret:string,label?:string):void {
  if (!['openrouter','codex','grok'].includes(provider) || typeof secret !== 'string' || !secret.trim() || Buffer.byteLength(secret) > 16_384 || /[\u0000]/u.test(secret)) invalid();
  if (label !== undefined && (typeof label !== 'string' || !label.trim() || Buffer.byteLength(label) > 120 || /[\u0000-\u001f\u007f]/u.test(label) || label.includes(secret))) invalid();
}
function metadata(record:CredentialRecord):ConnectionMetadata {
  return {id:record.id,provider:record.provider,...(record.label === undefined ? {} : {label:record.label}),createdAt:record.createdAt};
}
async function validateDirectory(directory:string,create:boolean):Promise<void> {
  if (!isAbsolute(directory) || directory === dirname(directory) || directory !== resolve(directory)) throw new CredentialError('CREDENTIAL_STORAGE_UNAVAILABLE');
  // Refuse storage inside portable projects. This examines only a fixed marker's
  // metadata; it never reads project contents or searches other directories.
  for (let ancestor = directory;; ancestor = dirname(ancestor)) {
    try {await lstat(join(ancestor,'deployment.yaml')); throw new CredentialError('CREDENTIAL_STORAGE_UNAVAILABLE');}
    catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
    if (dirname(ancestor) === ancestor) break;
  }
  if (!await machineDirectory(directory,create)) throw new CredentialError('CREDENTIAL_STORAGE_UNAVAILABLE');
}

/** Main-only store. The caller fixes directory from app userData, independently
 * of selected projects. No renderer, HTTP or preload secret-reading API exists. */
export class CredentialStore {
  #queue:Promise<unknown> = Promise.resolve();
  #closed = false;
  private constructor(private readonly directory:string,private readonly root:SafeRoot,private readonly encryption:EncryptionProvider) {}
  static async open(directory:string,encryption:EncryptionProvider):Promise<CredentialStore> {
    try {
      await validateDirectory(directory,true);
      return new CredentialStore(directory,await SafeRoot.open(directory),encryption);
    } catch (error) {throw credentialError(error);}
  }
  async #run<T>(action:()=>Promise<T>):Promise<T> {
    const operation = this.#queue.then(async () => {
      try {
        if (this.#closed) throw new CredentialError('CREDENTIAL_STORAGE_UNAVAILABLE');
        await validateDirectory(this.directory,false);
        const lease = await acquireLock(this.root,'settings',{timeoutMs:10_000});
        try {
          // Crash remnants contain ciphertext only. Discard them under the same
          // cross-instance lock before reading, rotating or removing any record.
          for (const name of await this.root.list()) if (temporaryPattern.test(name)) await this.root.removeOwnedEntry(name,await this.root.stat(name));
          await this.root.fsyncDirectory();
          return await action();
        } finally {await lease.release();}
      } catch (error) {throw credentialError(error);}
    });
    this.#queue = operation.catch(() => undefined);
    return operation;
  }
  async #available():Promise<void> {
    if (!await this.encryption.isAvailable()) throw new CredentialError('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
  }
  async #write(record:CredentialRecord,replace:boolean):Promise<void> {
    await this.#available();
    const ciphertext = await this.encryption.encrypt(JSON.stringify(record));
    if (!Buffer.isBuffer(ciphertext) || !ciphertext.length || ciphertext.length > maxCiphertext) invalid();
    const stage = `.credential-${randomUUID()}.tmp`;
    try {
      const handle = await this.root.createExclusive(stage);
      try {await handle.write(ciphertext); await handle.sync();} finally {await handle.close();}
      await this.root.fsyncDirectory();
      if (replace) await this.root.renameReplace(stage,`${record.id}.enc`);
      else await this.root.renameNoReplace(stage,`${record.id}.enc`);
      await this.root.fsyncDirectory();
    } finally {
      // Zeroize even when stage cleanup fails; cleanup errors never mask the write outcome.
      try {await this.root.removeOwnedEntry(stage,await this.root.stat(stage)); await this.root.fsyncDirectory();}
      catch {/* Stage already published, removed or unreadable; the primary error or result stands. */}
      finally {ciphertext.fill(0);}
    }
  }
  async #read(id:string):Promise<CredentialRecord> {
    validId(id); await this.#available();
    const filename = `${id}.enc`;
    let ciphertext:Buffer;
    try {
      await this.root.stat(filename);
      const stat = await lstat(join(this.directory,filename));
      if (stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) invalid();
      ciphertext = await this.root.readFile(filename,maxCiphertext);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new CredentialError('CREDENTIAL_NOT_FOUND');
      throw error;
    }
    if (!ciphertext.length) invalid();
    const decrypted = await this.encryption.decrypt(ciphertext);
    if (typeof decrypted.result !== 'string' || Buffer.byteLength(decrypted.result) > 32_768 || typeof decrypted.shouldReEncrypt !== 'boolean') invalid();
    let record:CredentialRecord;
    try {record = JSON.parse(decrypted.result) as CredentialRecord;} catch {return invalid();}
    if (!record || typeof record !== 'object' || record.formatVersion !== 1 || record.id !== id || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt)) || Object.keys(record).some(key => !['formatVersion','id','provider','secret','label','createdAt'].includes(key))) invalid();
    validInput(record.provider,record.secret,record.label);
    if (decrypted.shouldReEncrypt) await this.#write(record,true);
    return record;
  }
  create(provider:ConnectionProvider,secret:string,label?:string):Promise<ConnectionMetadata> {
    return this.#run(async () => {
      validInput(provider,secret,label);
      const record:CredentialRecord = {formatVersion:1,id:`connection-${randomUUID()}`,provider,secret,...(label === undefined ? {} : {label}),createdAt:new Date().toISOString()};
      await this.#write(record,false);
      return metadata(record);
    });
  }
  list():Promise<ConnectionMetadata[]> {
    return this.#run(async () => {
      const records:ConnectionMetadata[] = [];
      for (const file of await this.root.list()) {
        if (file === '.robopomelo-settings.lock') continue;
        if (!file.endsWith('.enc')) invalid();
        records.push(metadata(await this.#read(file.slice(0,-4))));
      }
      return records;
    });
  }
  /** Only ConnectionBroker in Electron main may consume this secret. */
  getSecret(id:string):Promise<string> {return this.#run(async () => (await this.#read(id)).secret);}
  remove(id:string):Promise<void> {
    return this.#run(async () => {
      validId(id);
      const filename = `${id}.enc`;
      try {await this.root.removeOwnedEntry(filename,await this.root.stat(filename));}
      catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
      await this.root.fsyncDirectory();
    });
  }
  async close():Promise<void> {
    await this.#queue;
    if (this.#closed) return;
    this.#closed = true;
    try {await this.root.close();} catch (error) {throw credentialError(error);}
  }
}
