import envPaths from 'env-paths';
import { isAbsolute, join, parse, resolve, sep } from 'node:path';
import { lstat, mkdir } from 'node:fs/promises';
import { ProjectFsError } from '../errors.js';

export interface MachinePaths {config:string; data:string; cache:string; log:string; temp:string}
export function machinePaths(options:{root?:string} = {}):MachinePaths {
  if (!options.root) return envPaths('robopomelo',{suffix:''});
  if (!isAbsolute(options.root)) throw new ProjectFsError('INVALID_PATH','Machine storage override must be absolute.');
  return {config:join(options.root,'config'),data:join(options.root,'data'),cache:join(options.root,'cache'),log:join(options.root,'log'),temp:join(options.root,'temp')};
}

/** Read-only callers never create the directory. Config ancestors may not be links. */
export async function machineDirectory(directory:string,create:boolean):Promise<string|undefined> {
  if (!isAbsolute(directory)) throw new ProjectFsError('INVALID_PATH','Machine configuration path must be absolute.');
  const absolute = resolve(directory);
  const root = parse(absolute).root;
  let current = root;
  for (const segment of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current,segment);
    let stat;
    try {stat = await lstat(current);}
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!create) return undefined;
      try {await mkdir(current,{mode:0o700});} catch (next) {if ((next as NodeJS.ErrnoException).code !== 'EEXIST') throw next;}
      stat = await lstat(current);
    }
    if (stat.isSymbolicLink()) throw new ProjectFsError('PATH_ESCAPE','Machine configuration links are not permitted.');
    if (!stat.isDirectory()) throw new ProjectFsError('SETTINGS_INVALID','Machine configuration ancestor is not a directory.');
    if (current === absolute && process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))) throw new ProjectFsError('SETTINGS_INVALID','Machine configuration directory must be owned by this user with owner-only permissions.');
  }
  return absolute;
}
