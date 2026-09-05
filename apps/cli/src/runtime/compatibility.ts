import semver from 'semver';
import type { CompatibilityProbe, RuntimeManifest } from './contracts.js';
import { RuntimeError } from './errors.js';
export function assertCompatible(manifest: RuntimeManifest, probe: CompatibilityProbe): void {
  const spec = probe.specVersion ?? '1.0.0';
  if (
    manifest.launcherProtocol !== probe.launcherProtocol ||
    manifest.migrationRequired ||
    !semver.satisfies(probe.nodeVersion, manifest.nodeRange) ||
    !semver.satisfies(spec, manifest.specRange) ||
    !semver.satisfies(probe.ruleSetVersion, manifest.ruleSetRange) ||
    !manifest.platforms.includes(`${probe.platform}-${probe.arch}`)
  )
    throw new RuntimeError(
      'RUNTIME_INCOMPATIBLE',
      'Runtime cannot safely read this specification on the installed Node and platform without migration.',
    );
}
export function automaticEligible(
  manifest: RuntimeManifest,
  currentVersion: string,
  probe: CompatibilityProbe,
): boolean {
  try {
    assertCompatible(manifest, probe);
    return (
      manifest.channel === 'stable' &&
      !semver.prerelease(manifest.version) &&
      semver.valid(currentVersion) !== null &&
      semver.gt(manifest.version, currentVersion) &&
      semver.major(manifest.version) === semver.major(currentVersion)
    );
  } catch {
    return false;
  }
}
