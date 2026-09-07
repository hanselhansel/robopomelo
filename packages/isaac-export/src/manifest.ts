import { sha256Hex } from '@robopomelo/spatial';
import type { ExportMember } from './members.js';
import type { IsaacExportPlan } from './plan.js';
export const MANIFEST_FORMAT_VERSION = '1.0.0';
export const ASSET_STATEMENT = 'NVIDIA Isaac Sim assets are not bundled. The operator installs the named asset pack under the target Isaac Sim 6.0.0 installation and records the installed file checksum in the acceptance manifest before a runnable-reference result is accepted.';
/** `asset-requirements.json`: target assets the operator must provide. A null
 * sha256 is an obligation to record the installed checksum, never a waiver. */
export function buildAssetRequirements(plan: IsaacExportPlan): Record<string, unknown> {
  return {
    formatVersion: MANIFEST_FORMAT_VERSION,
    target: plan.profile.targetId,
    bundled: false,
    statement: ASSET_STATEMENT,
    assets: plan.profile.supportedRobotAssets.map((asset) => ({
      catalogId: asset.catalogId, targetRobot: asset.targetRobot, usdRelativePath: asset.usdRelativePath, assetPackName: asset.assetPackName,
      sha256: asset.sha256, checksumStatus: asset.sha256 === null ? 'operator-must-record' : 'pinned',
    })),
    referencedByRobots: plan.mode === 'runnable-reference' ? plan.robots.map((robot) => ({ id: robot.id, usdRelativePath: robot.usdRelativePath })) : [],
  };
}
/** `manifest.json`, computed after every other member so hashes are exact. */
export function buildManifest(plan: IsaacExportPlan, members: readonly ExportMember[]): Record<string, unknown> {
  const { profile } = plan;
  return {
    formatVersion: MANIFEST_FORMAT_VERSION,
    generator: '@robopomelo/isaac-export',
    target: {
      targetId: profile.targetId, isaacVersion: profile.isaacVersion, os: profile.os, arch: profile.arch, upAxis: profile.upAxis, metersPerUnit: profile.metersPerUnit,
      supportedDrives: profile.supportedDrives, supportedStationKinds: profile.supportedStationKinds, supportedLoadTypes: profile.supportedLoadTypes,
      maxRobots: profile.maxRobots, maxStations: profile.maxStations, maxIntersections: profile.maxIntersections, unsupported: profile.unsupported,
    },
    mode: plan.mode,
    runnableBadge: plan.runnableBadge,
    remainingSetup: plan.remainingSetup,
    source: { projectId: plan.source.projectId, projectName: plan.source.projectName, sourceRevision: plan.source.sourceRevision, sourceHash: plan.source.sourceHash },
    sceneId: plan.sceneId,
    scenarioId: plan.scenarioId,
    sceneHash: plan.scene.sourceHash,
    run: plan.run,
    generatedAt: plan.generatedAt,
    files: [...members].sort((a, b) => (a.path < b.path ? -1 : 1)).map((member) => ({ path: member.path, mediaType: member.mediaType, sha256: sha256Hex(member.bytes), size: member.bytes.byteLength })),
    assetRequirements: {
      bundled: false, statement: ASSET_STATEMENT,
      assets: profile.supportedRobotAssets.map((asset) => ({ usdRelativePath: asset.usdRelativePath, assetPackName: asset.assetPackName, sha256: asset.sha256 })),
    },
    nonClaims: ['interoperability test only', 'no production readiness claim', 'no safety certification', 'not a validation of a full warehouse AMR fleet'],
  };
}
