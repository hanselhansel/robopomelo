import semver from 'semver';
import { assertPublicURL, PublicReleaseNetwork } from './network.js';
import { RuntimeError } from './errors.js';
import type { ReleaseMetadata } from './contracts.js';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export async function releaseMetadata(
  network: PublicReleaseNetwork,
  version = 'latest',
  options: { offline?: boolean; signal?: AbortSignal } = {},
): Promise<ReleaseMetadata> {
  if (version !== 'latest' && (!semver.valid(version) || version.length > 40))
    throw new RuntimeError('UPDATE_VERSION_INVALID', 'Select an exact runtime version.');
  const data = await network.json(`https://registry.npmjs.org/robopomelo/${version}`, options);
  if (
    !object(data) ||
    data.name !== 'robopomelo' ||
    typeof data.version !== 'string' ||
    !semver.valid(data.version) ||
    (version !== 'latest' && data.version !== version) ||
    !object(data.dist) ||
    typeof data.dist.integrity !== 'string' ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(data.dist.integrity) ||
    typeof data.dist.tarball !== 'string' ||
    !object(data.dist.attestations) ||
    typeof data.dist.attestations.url !== 'string'
  )
    throw new RuntimeError(
      'RELEASE_UNVERIFIED',
      'Registry release metadata lacks an exact version, strong integrity or provenance.',
    );
  assertPublicURL(data.dist.tarball);
  assertPublicURL(data.dist.attestations.url);
  return {
    version: data.version,
    integrity: data.dist.integrity,
    tarball: data.dist.tarball,
    attestations: data.dist.attestations.url,
  };
}
