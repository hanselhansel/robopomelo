import { requireSettingsAuthority } from './schema.js';
import type { SettingsAuthority, UpdatePolicy, UpdateSettings } from './schema.js';
import type { SettingsStore } from './store.js';
const policy = (s: UpdateSettings): UpdatePolicy => ({
  mode: s.mode,
  offline: s.offline,
  pinnedVersion: s.pinnedVersion,
  skippedVersions: [...s.skippedVersions],
});
/** Local policy only. This class performs no registry or network requests. */
export class UpdatePreferences {
  constructor(private readonly settings: SettingsStore) {}
  async read(): Promise<UpdateSettings> {
    return (await this.settings.read()).updates;
  }
  async configure(patch: Partial<UpdatePolicy>, authority: SettingsAuthority): Promise<UpdateSettings> {
    requireSettingsAuthority(authority);
    const saved = await this.settings.update((draft) => {
      draft.updates = { ...draft.updates, ...patch, generation: draft.updates.generation + 1 };
    });
    return saved.updates;
  }
  async hold(
    version: string,
    previousVersion: string | null,
    authority: SettingsAuthority,
  ): Promise<UpdateSettings> {
    requireSettingsAuthority(authority);
    const saved = await this.settings.update((draft) => {
      const next = draft.updates.generation + 1;
      draft.updates.rollbackHold = {
        version,
        previousVersion,
        priorPolicy: policy(draft.updates),
        policyGeneration: next,
      };
      draft.updates.generation = next;
    });
    return saved.updates;
  }
  async resume(authority: SettingsAuthority): Promise<UpdateSettings> {
    requireSettingsAuthority(authority);
    const saved = await this.settings.update((draft) => {
      const s = draft.updates,
        hold = s.rollbackHold;
      if (hold && s.generation === hold.policyGeneration) Object.assign(s, hold.priorPolicy);
      s.rollbackHold = null;
      s.generation++;
    });
    return saved.updates;
  }
}
