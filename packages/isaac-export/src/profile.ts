import type { Drive, StationKind } from '@robopomelo/spec';
/** The single supported target. Anything else is an importable-only export
 * without a runnable-reference badge. NVIDIA assets are never bundled: the
 * operator installs the named asset pack separately and records the installed
 * checksum in the acceptance manifest. A `sha256: null` entry means exactly
 * that: the checksum is an operator obligation, not a value we ship. */
export type SupportedRobotAsset = {
  catalogId: string; targetRobot: 'jetbot'; usdRelativePath: string; assetPackName: string; sha256: string | null;
};
export type IsaacTargetProfile = {
  targetId: string; isaacVersion: string; os: string; arch: string; upAxis: 'Z'; metersPerUnit: 1;
  supportedDrives: readonly Drive[]; supportedRobotAssets: readonly SupportedRobotAsset[]; supportedStationKinds: readonly StationKind[];
  maxRobots: number; maxStations: number; maxIntersections: number; supportedLoadTypes: readonly string[];
  unsupported: { drives: readonly Drive[]; features: readonly string[] };
};
export const ISAAC_6_0_0_UBUNTU_2404_X86_64: IsaacTargetProfile = Object.freeze({
  targetId: 'isaac-sim-6.0.0-ubuntu24.04-x86_64',
  isaacVersion: '6.0.0',
  os: 'ubuntu-24.04',
  arch: 'x86_64',
  upAxis: 'Z',
  metersPerUnit: 1,
  supportedDrives: ['differential'],
  supportedRobotAssets: [{
    catalogId: 'robot-differential', targetRobot: 'jetbot', usdRelativePath: 'Isaac/Robots/NVIDIA/Jetbot/jetbot.usd',
    assetPackName: 'Isaac Sim 6.0.0 core assets (separately installed, NVIDIA license)', sha256: null,
  }],
  supportedStationKinds: ['pickup', 'dropoff'],
  maxRobots: 2,
  maxStations: 2,
  maxIntersections: 1,
  supportedLoadTypes: ['none'],
  unsupported: { drives: ['omnidirectional'], features: ['charging', 'holding poses', 'multi-floor', 'conveyors', 'lifts', 'custom meshes'] },
} as const);
export const robotAssetFor = (profile: IsaacTargetProfile, catalogId: string): SupportedRobotAsset | undefined =>
  profile.supportedRobotAssets.find((asset) => asset.catalogId === catalogId);
