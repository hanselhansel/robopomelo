import type { UpdatePreferences } from '../../../../packages/project-fs/src/settings/updates.js';
import type { RunPolicy, RuntimeSelection } from './selection.js';
export interface RuntimeFile {
  path: string;
  size: number;
  sha256: string;
}
export interface RuntimeManifest {
  formatVersion: 1;
  packageName: 'robopomelo';
  version: string;
  channel: 'stable' | 'candidate';
  launcherProtocol: 1;
  nodeRange: string;
  specRange: string;
  ruleSetRange: string;
  platforms: string[];
  migrationRequired: boolean;
  entryPoint: string;
  files: RuntimeFile[];
  skills: { id: string; path: string }[];
  webAssets: string[];
}
export interface CompatibilityProbe {
  nodeVersion: string;
  platform: string;
  arch: string;
  specVersion?: string;
  ruleSetVersion: string;
  launcherProtocol: 1;
}
export interface ReleaseMetadata {
  version: string;
  integrity: string;
  tarball: string;
  attestations: string;
}
export interface PayloadDigest {
  sha256: string;
  sha512: string;
}
export interface VerificationReceipt {
  formatVersion: 1;
  packageName: 'robopomelo';
  version: string;
  sha256: string;
  sha512: string;
  sourceCommit: string;
  identity: string;
  verifiedAt: string;
}
export interface RuntimeDescriptor {
  manifest: RuntimeManifest;
  directory: string;
  manifestDigest: string;
  source: 'bundle' | 'cache';
}
export interface UpdateOutcome {
  status: 'current' | 'available' | 'installed' | 'not-checked' | 'failed' | 'rolled-back';
  version: string;
  pendingVersion: string | null;
  message: string;
}
export interface RuntimeStatus {
  selection: RuntimeSelection;
  runtime: RuntimeDescriptor;
  policy: Awaited<ReturnType<UpdatePreferences['read']>>;
  lastOutcome: UpdateOutcome | null;
}
export interface LaunchOptions extends RunPolicy {
  readOnly?: boolean;
  startupCheck?: boolean;
}
