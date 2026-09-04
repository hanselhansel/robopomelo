import { requireSettingsAuthority } from './schema.js';
import type { SettingsAuthority, UpdateSettings } from './schema.js';
import type { SettingsStore } from './store.js';

/** Local policy only. This class performs no registry or network requests. */
export class UpdatePreferences {
  constructor(private readonly settings:SettingsStore) {}
  async read():Promise<UpdateSettings> {return (await this.settings.read()).updates;}
  async configure(patch:Partial<UpdateSettings>,authority:SettingsAuthority):Promise<UpdateSettings> {
    requireSettingsAuthority(authority);
    const saved = await this.settings.update(draft => {draft.updates = {...draft.updates,...patch};});
    return saved.updates;
  }
}
