import { RuntimeCache } from '../runtime/cache.js';
import { loadBundledRuntime } from '../runtime/bundle.js';
import { UpdateService } from '../runtime/update.js';
import { UpdatePreferences } from '../../../../packages/project-fs/src/settings/updates.js';
import { machinePaths } from '../../../../packages/project-fs/src/fs/machine-paths.js';
import { RULE_SET_VERSION } from '@robopomelo/core';
import type { ProjectService } from './project.js';
import type { RuntimeIdentity } from '../server/update-routes.js';
export interface ParentIdentity {
  launcherDirectory?: string;
  launcherVersion?: string;
  bundledRuntimeVersion?: string;
}
export async function runtimeContext(
  project: ProjectService,
  packageDirectory: string,
  parent: ParentIdentity = {},
  offline = false,
) {
  const bundle = await loadBundledRuntime(parent.launcherDirectory ?? packageDirectory);
  const updater = new UpdateService({
    bundle,
    cache: new RuntimeCache({ directory: process.env.ROBOPOMELO_CACHE_DIR ?? machinePaths().cache }),
    preferences: new UpdatePreferences(project.settings),
    probe: {
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      ruleSetVersion: RULE_SET_VERSION,
      launcherProtocol: 1,
    },
  });
  const identity: RuntimeIdentity = {
    toolVersion: project.options.toolVersion,
    launcherVersion: parent.launcherVersion ?? bundle.manifest.version,
    bundledRuntimeVersion: parent.bundledRuntimeVersion ?? bundle.manifest.version,
    sourceCheckout: bundle.manifest.version === '0.0.0',
    offline,
  };
  return { updater, identity };
}
