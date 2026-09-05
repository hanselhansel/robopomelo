import { capabilities } from '@robopomelo/spec';
import { arity } from './common.js';
import type { CommandHandler } from './types.js';
export const capabilityCommand: CommandHandler = async (command, context) => {
  arity(command, 0);
  return { data: { toolVersion: context.toolVersion, specVersion: '1.0.0', capabilities } };
};
export const doctor: CommandHandler = async (command, context) => {
  arity(command, 0);
  const settings = await context.project.settings.read(),
    runtime = context.updater ? await context.updater.status({ offline: true }) : null;
  const project = context.project.current ? await context.project.read() : null;
  let lockPresent = false,
    recoveryDirectories: string[] = [];
  if (context.project.current)
    await context.project.withProject(async (selected) => {
      try {
        await selected.root.stat('.robopomelo-project.lock');
        lockPresent = true;
      } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') throw error;
      }
      try {
        recoveryDirectories = await selected.root.list('.robopomelo/recovery');
      } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') throw error;
      }
    });
  return {
    data: {
      toolVersion: context.toolVersion,
      launcherVersion: context.launcherVersion ?? null,
      bundledRuntimeVersion: context.bundledRuntimeVersion ?? null,
      selectedRuntimeVersion: runtime?.runtime.manifest.version ?? context.toolVersion,
      selectionReason: runtime?.selection.reason ?? null,
      effectiveUpdatePolicy: runtime?.policy ?? settings.updates,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      runtime: runtime
        ? {
            version: runtime.runtime.manifest.version,
            source: runtime.runtime.source,
            selectionReason: runtime.selection.reason,
            manifestDigest: runtime.runtime.manifestDigest,
          }
        : null,
      updatePolicy: settings.updates,
      settings: { valid: true, generation: settings.generation },
      project: context.project.status(),
      source:
        project?.kind === 'readable'
          ? {
              kind: 'readable',
              sourceRevision: project.snapshot.sourceRevision,
              sourceHash: project.snapshot.sourceHash,
              readiness: project.snapshot.validation.readiness,
            }
          : project
            ? { kind: 'inspection', problems: project.problems }
            : null,
      lock: { present: lockPresent },
      recovery: {
        directories: recoveryDirectories,
        action: 'Use history recover to inspect and finish already committed recovery metadata.',
      },
    },
  };
};
