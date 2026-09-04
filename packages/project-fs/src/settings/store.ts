import { randomUUID } from 'node:crypto';
import { SafeRoot } from '../fs/safe-fs.js';
import { acquireLock } from '../fs/lock.js';
import { machineDirectory, machinePaths } from '../fs/machine-paths.js';
import { ProjectFsError } from '../errors.js';
import { defaultSettings, parseSettings, validateSettings } from './schema.js';
import type { MachineSettings } from './schema.js';

export class SettingsStore {
  constructor(private readonly directory = machinePaths().config) {}
  async #read(root:SafeRoot):Promise<{state:MachineSettings; bytes:Buffer|null}> {
    try {
      const bytes = await root.readFile('settings.json',1024 * 1024);
      return {state:parseSettings(bytes),bytes};
    } catch (error) {if ((error as {code?:string}).code === 'ENOENT') return {state:defaultSettings(),bytes:null}; throw error;}
  }
  async read():Promise<MachineSettings> {
    const directory = await machineDirectory(this.directory,false);
    if (!directory) return defaultSettings();
    const root = await SafeRoot.open(directory);
    try {return (await this.#read(root)).state;} finally {await root.close();}
  }
  async #locked<T>(create:boolean,action:(root:SafeRoot|null)=>Promise<T>):Promise<T> {
    const directory = await machineDirectory(this.directory,create);
    if (!directory) return action(null);
    const root = await SafeRoot.open(directory);
    try {
      const lease = await acquireLock(root,'settings',{timeoutMs:10_000});
      try {return await action(root);} finally {await lease.release();}
    } finally {await root.close();}
  }
  /** Acquire the project lock first. This short settings lock remains held
   * through the caller's final generation check and source replacement. */
  async withCurrent<T>(action:(state:MachineSettings)=>Promise<T>):Promise<T> {
    return this.#locked(false,async root => action(root?(await this.#read(root)).state:defaultSettings()));
  }
  async update(mutate:(draft:MachineSettings)=>void|Promise<void>):Promise<MachineSettings> {
    return this.#locked(true,async root => {
      if (!root) throw new ProjectFsError('SETTINGS_INVALID','Settings directory was not created.');
      const previous = await this.#read(root);
      const next = structuredClone(previous.state);
      await mutate(next);
      next.generation = previous.state.generation + 1;
      validateSettings(next);
      const bytes = Buffer.from(JSON.stringify(next,null,2)+'\n');
      if (bytes.byteLength > 1024 * 1024) throw new ProjectFsError('LIMIT_EXCEEDED','Machine settings exceed their byte limit.');
      const stage = `.settings-${randomUUID()}.tmp`;
      await this.#write(root,stage,bytes);
      if (previous.bytes) await this.#write(root,`settings.previous-${randomUUID()}.json`,previous.bytes);
      await root.fsyncDirectory();
      await root.renameReplace(stage,'settings.json');
      await root.fsyncDirectory();
      const confirmed = await this.#read(root);
      if (!confirmed.bytes?.equals(bytes)) throw new ProjectFsError('SETTINGS_CHANGED','Settings changed during atomic replacement.');
      return confirmed.state;
    });
  }
  async #write(root:SafeRoot,path:string,bytes:Buffer):Promise<void> {
    const handle = await root.createExclusive(path);
    try {await handle.write(bytes); await handle.sync();} finally {await handle.close();}
  }
}
