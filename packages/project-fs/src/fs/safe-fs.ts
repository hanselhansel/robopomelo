import { constants } from 'node:fs';
import { lstat, realpath, readdir, open, mkdir, rename, link, unlink, rmdir, statfs } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { ProjectFsError } from '../errors.js';
import { SOURCE_BYTE_LIMIT } from '../limits.js';
import { portableNameKey, projectRelativePath } from './paths.js';
import { FileAccess } from './file-access.js';

export interface RootIdentity {canonicalPath:string; device:string; fileId:string}
export interface SafeStat {kind:'file'|'directory'; size:number; mtimeMs:number; device:string; fileId:string}
export interface ReadHandle {readFile(limit?:number):Promise<Buffer>; readChunk(size?:number):Promise<Buffer>; stat():Promise<SafeStat>; close():Promise<void>}
export interface WriteHandle {write(bytes:Uint8Array):Promise<void>; sync():Promise<void>; close():Promise<void>}
const same = (a:BigIntStats,b:BigIntStats) => a.dev === b.dev && a.ino === b.ino;
const noFollow = process.platform === 'win32' ? 0 : constants.O_NOFOLLOW;
const info = (s:BigIntStats):SafeStat => ({kind:s.isDirectory()?'directory':'file',size:Number(s.size),mtimeMs:Number(s.mtimeMs),device:String(s.dev),fileId:String(s.ino)});
const fail = (code:string,message:string):never => {throw new ProjectFsError(code,message);};

/** Portable checked I/O. This is not kernel-enforced confinement against a
 * concurrent unrestricted same-user process replacing ancestors between checks.
 * Project HTTP operations must never expose arbitrary directory substitution. */
export class SafeRoot {
  #closed = false;
  #handles = new Set<FileHandle>();
  #fileAccess = new FileAccess();
  private constructor(private readonly path:string, private readonly pinned:BigIntStats, private readonly rootHandle:FileHandle|null) {}

  static async open(selectedPath:string):Promise<SafeRoot> {
    const canonical = await realpath(selectedPath);
    const before = await lstat(canonical,{bigint:true});
    if (!before.isDirectory() || before.isSymbolicLink()) fail('INVALID_ROOT','Project root must be a canonical directory.');
    const filesystem = await statfs(canonical);
    // Known NFS, SMB/CIFS and SMB2 types cannot provide the local lock semantics.
    if ([0x6969, 0x517b, 0xff534d42, 0xfe534d42].includes(Number(filesystem.type))) fail('UNSUPPORTED_FILESYSTEM','Use a local filesystem with reliable file identity and rename semantics.');
    let handle:FileHandle|null = null;
    try {handle = await open(canonical, constants.O_RDONLY | noFollow);}
    catch (error) {
      // Windows may deny directory descriptors. Path identity remains pinned and
      // rechecked, with the same documented same-user race limit as other paths.
      if (process.platform !== 'win32' || !['EISDIR','EPERM','EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
    try {
      if (handle && !same(before,await handle.stat({bigint:true}))) fail('ROOT_CHANGED','Project root changed while opening.');
      const root = new SafeRoot(canonical,before,handle);
      await root.#checkRoot();
      return root;
    } catch (error) {await handle?.close(); throw error;}
  }

  identity():RootIdentity {return {canonicalPath:this.path,device:String(this.pinned.dev),fileId:String(this.pinned.ino)};}

  async #checkRoot():Promise<void> {
    if (this.#closed) fail('ROOT_CLOSED','Project session is closed.');
    let current:BigIntStats;
    try {current = await lstat(this.path,{bigint:true});}
    catch {return fail('ROOT_CHANGED','Pinned project root is no longer available.');}
    if (current.isSymbolicLink() || !same(current,this.pinned) || (this.rootHandle && !same(await this.rootHandle.stat({bigint:true}),this.pinned))) fail('ROOT_CHANGED','Pinned project root was replaced.');
  }

  async #checked(value:string, allowMissing = false):Promise<{path:string; stat:BigIntStats|null}> {
    await this.#checkRoot();
    const segments = projectRelativePath(value).split('/');
    let path = this.path;
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!;
      const siblings = await readdir(path);
      const collisions = siblings.filter(name => portableNameKey(name) === portableNameKey(segment));
      if (collisions.length > 1 || (collisions.length === 1 && collisions[0] !== segment)) fail('PATH_COLLISION','Path conflicts with an existing portable filename.');
      path = join(path,segment);
      let entry:BigIntStats;
      try {entry = await lstat(path,{bigint:true});}
      catch (error) {
        if (allowMissing && index === segments.length - 1 && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          await this.#checkRoot(); return {path,stat:null};
        }
        throw error;
      }
      if (entry.isSymbolicLink()) fail('PATH_ESCAPE','Managed symbolic links and junctions are not permitted.');
      if (entry.dev !== this.pinned.dev) fail('UNSUPPORTED_FILESYSTEM','Managed paths must remain on the pinned filesystem.');
      if (!entry.isFile() && !entry.isDirectory()) fail('UNSUPPORTED_FILE','Only regular files and directories are supported.');
      const resolved = await realpath(path);
      const within = relative(this.path,resolved);
      if (isAbsolute(within) || within === '..' || within.startsWith('../') || within.startsWith('..\\')) fail('PATH_ESCAPE','Path resolves outside the pinned project root.');
      if (index < segments.length - 1 && !entry.isDirectory()) fail('INVALID_PATH','Path ancestor is not a directory.');
      if (index === segments.length - 1) {await this.#checkRoot(); return {path,stat:entry};}
    }
    return fail('INVALID_PATH','Invalid project path.');
  }

  async #openFile(value:string,create:boolean):Promise<FileHandle> {
    const before = await this.#checked(value,create);
    if (before.stat && !before.stat.isFile()) fail('UNSUPPORTED_FILE','Expected a regular file.');
    const flags = create ? constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow : constants.O_RDONLY | noFollow | constants.O_NONBLOCK;
    const handle = await open(before.path,flags,0o600);
    try {
      const opened = await handle.stat({bigint:true});
      if (!opened.isFile() || (before.stat && !same(before.stat,opened))) fail('PATH_CHANGED','Opened file differs from the inspected file.');
      const after = await this.#checked(value);
      if (!after.stat || !same(after.stat,opened)) fail('PATH_CHANGED','File changed while opening.');
      this.#handles.add(handle);
      return handle;
    } catch (error) {await handle.close(); throw error;}
  }

  async #closeHandle(handle:FileHandle):Promise<void> {
    if (this.#handles.delete(handle)) await handle.close();
  }

  async openRead(value:string):Promise<ReadHandle> {
    const handle = await this.#openFile(value,false);
    const guard = async () => {await this.#checkRoot(); if (!this.#handles.has(handle)) fail('HANDLE_CLOSED','File handle is closed.');};
    const readChunk = async (size = 64 * 1024):Promise<Buffer> => {
      await guard();
      if (!Number.isSafeInteger(size) || size < 1 || size > SOURCE_BYTE_LIMIT) fail('INVALID_LIMIT','Read chunk must be between 1 byte and 8 MiB.');
      const buffer = Buffer.alloc(size);
      const {bytesRead} = await handle.read(buffer,0,size,null);
      await guard();
      return buffer.subarray(0,bytesRead);
    };
    return Object.freeze({
      readChunk,
      readFile:async (limit = SOURCE_BYTE_LIMIT) => {
        await guard();
        if (!Number.isSafeInteger(limit) || limit < 0) fail('INVALID_LIMIT','A nonnegative safe byte limit is required.');
        if ((await handle.stat({bigint:true})).size > BigInt(limit)) fail('LIMIT_EXCEEDED','File exceeds the allowed byte limit.');
        const chunks:Buffer[] = []; let total = 0;
        while (true) {
          const chunk = await readChunk(Math.min(64 * 1024,limit - total + 1));
          if (!chunk.length) break;
          total += chunk.length;
          if (total > limit) fail('LIMIT_EXCEEDED','File exceeds the allowed byte limit.');
          chunks.push(chunk);
        }
        return Buffer.concat(chunks,total);
      },
      stat:async () => {await guard(); return info(await handle.stat({bigint:true}));},
      close:() => this.#closeHandle(handle),
    });
  }

  async readFile(value:string,limit = SOURCE_BYTE_LIMIT):Promise<Buffer> {
    return this.#fileAccess.run(projectRelativePath(value), async () => {
      const handle = await this.openRead(value);
      try {return await handle.readFile(limit);} finally {await handle.close();}
    });
  }

  async createExclusive(value:string):Promise<WriteHandle> {
    const handle = await this.#openFile(value,true);
    const guard = async () => {await this.#checkRoot(); if (!this.#handles.has(handle)) fail('HANDLE_CLOSED','File handle is closed.');};
    return Object.freeze({
      write:async (bytes:Uint8Array) => {
        await guard(); let offset = 0;
        while (offset < bytes.byteLength) {
          const result = await handle.write(bytes,offset,bytes.byteLength-offset,null);
          if (!result.bytesWritten) fail('IO_ERROR','File write made no progress.');
          offset += result.bytesWritten;
        }
        await guard();
      },
      sync:async () => {await guard(); await handle.sync();},
      close:() => this.#closeHandle(handle),
    });
  }

  async mkdir(value:string):Promise<void> {
    const target = await this.#checked(value,true);
    await mkdir(target.path,{mode:0o700});
    await this.#checked(value);
  }

  async renameReplace(staged:string,destination:string):Promise<void> {
    return this.#fileAccess.run(projectRelativePath(destination), async () => {
      const from = await this.#checked(staged);
      const to = await this.#checked(destination,true);
      if (!from.stat?.isFile() || (to.stat && !to.stat.isFile())) fail('UNSUPPORTED_FILE','Replacement supports regular files only.');
      await rename(from.path,to.path);
      const after = await this.#checked(destination);
      if (!after.stat || !same(from.stat!,after.stat)) fail('PATH_CHANGED','Replacement identity changed.');
    });
  }

  async renameNoReplace(fromValue:string,toValue:string):Promise<void> {
    const from = await this.#checked(fromValue);
    const to = await this.#checked(toValue,true);
    if (!from.stat?.isFile()) fail('UNSUPPORTED_OPERATION','Portable no-replace publication supports regular files only.');
    // link is atomic no-clobber. A crash before unlink leaves both names, never lost data.
    await link(from.path,to.path);
    const after = await this.#checked(toValue);
    const current = await this.#checked(fromValue);
    if (!after.stat || !current.stat || !same(from.stat!,after.stat) || !same(from.stat!,current.stat)) fail('PATH_CHANGED','Publication identity changed.');
    await unlink(from.path);
    await this.#checkRoot();
  }

  async stat(value:string):Promise<SafeStat> {const result = await this.#checked(value); return info(result.stat!);}

  /** @internal Lock/settings cleanup only. Never expose through a project route. */
  async removeOwnedEntry(value:string,expected:SafeStat):Promise<void> {
    const current = await this.#checked(value);
    if (!current.stat || String(current.stat.dev) !== expected.device || String(current.stat.ino) !== expected.fileId) fail('PATH_CHANGED','Refusing to remove a replaced entry.');
    if (current.stat!.isDirectory()) await rmdir(current.path);
    else await unlink(current.path);
    await this.#checkRoot();
  }

  /** @internal Called only under the matching exclusive recovery claim. */
  async quarantineLock(kind:'project'|'settings',expected:SafeStat,claim:SafeStat):Promise<string> {
    if (kind !== 'project' && kind !== 'settings') fail('INVALID_LOCK','Only fixed lock namespaces may be quarantined.');
    const from = await this.#checked(`.robopomelo-${kind}.lock`);
    const recovery = await this.#checked(`.robopomelo-${kind}.recovery`);
    if (!from.stat?.isDirectory() || !recovery.stat?.isDirectory() || String(from.stat.dev) !== expected.device || String(from.stat.ino) !== expected.fileId || String(recovery.stat.dev) !== claim.device || String(recovery.stat.ino) !== claim.fileId) fail('LOCK_CHANGED','Lock or recovery claim changed.');
    const destination = `.robopomelo-${kind}.quarantine-${randomUUID()}`;
    const to = await this.#checked(destination,true);
    if (to.stat) fail('PATH_COLLISION','Generated quarantine path already exists.');
    // This is a coarse-lock guarded generated destination, not a portable
    // general-purpose atomic no-clobber directory rename.
    await rename(from.path,to.path);
    const moved = await this.#checked(destination);
    if (!moved.stat || !same(from.stat!,moved.stat)) fail('LOCK_CHANGED','Quarantined directory identity changed.');
    return destination;
  }

  /** @internal Publish a completed export directory while holding the project
   * lock. Generated staging and an absent destination are rechecked here. */
  async publishExportDirectory(staged:string,destination:string,expected:SafeStat,lock:SafeStat):Promise<void> {
    if(!/^exports\/\.incomplete-[a-f0-9-]{36}$/.test(staged)||!destination.startsWith('exports/')||destination.split('/').length!==2)fail('INVALID_PATH','Only generated export directories may be published.');
    const from=await this.#checked(staged),to=await this.#checked(destination,true),held=await this.#checked('.robopomelo-project.lock');
    if(to.stat)fail('PATH_COLLISION','Export destination already exists.');
    if(!from.stat?.isDirectory()||!held.stat?.isDirectory()||String(from.stat.dev)!==expected.device||String(from.stat.ino)!==expected.fileId||String(held.stat.dev)!==lock.device||String(held.stat.ino)!==lock.fileId)fail('PATH_CHANGED','Export staging or project lock identity changed.');
    await rename(from.path,to.path);
    const after=await this.#checked(destination);if(!after.stat||!same(from.stat!,after.stat))fail('PATH_CHANGED','Published export identity changed.');
  }

  async list(value?:string):Promise<string[]> {
    await this.#checkRoot();
    const directory = value === undefined ? {path:this.path,stat:this.pinned} : await this.#checked(value);
    if (!directory.stat?.isDirectory()) fail('INVALID_PATH','Expected a directory.');
    const entries = await readdir(directory.path);
    const keys = new Set<string>();
    for (const entry of entries) {
      projectRelativePath(entry);
      const key = portableNameKey(entry);
      if (keys.has(key)) fail('PATH_COLLISION','Directory contains portable case collisions.');
      keys.add(key);
    }
    await this.#checkRoot();
    return entries.sort();
  }

  async fsyncDirectory(value?:string):Promise<'flushed'|'unsupported'> {
    await this.#checkRoot();
    const target = value === undefined ? {path:this.path,stat:this.pinned} : await this.#checked(value);
    if (!target.stat?.isDirectory()) fail('INVALID_PATH','Expected a directory.');
    let handle:FileHandle|undefined;
    try {
      handle = await open(target.path,constants.O_RDONLY | noFollow);
      if (!same(target.stat!,await handle.stat({bigint:true}))) fail('PATH_CHANGED','Directory changed before flush.');
      await handle.sync();
    } catch (error) {
      // Windows does not expose portable directory fsync through Node.
      if (process.platform !== 'win32' || !['EISDIR','EINVAL','ENOTSUP','EPERM','EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await this.#checkRoot();
      return 'unsupported';
    } finally {await handle?.close();}
    await this.#checkRoot();
    return 'flushed';
  }

  async close():Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const results = await Promise.allSettled([...this.#handles].map(handle => this.#closeHandle(handle)));
    await this.rootHandle?.close();
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
}
