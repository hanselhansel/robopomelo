import { createHash } from 'node:crypto';
import { archive } from './archive.js';
import { manifest, runtimeFiles, digest } from './runtime.js';
import type {
  PayloadDigest,
  ReleaseMetadata,
  VerificationReceipt,
} from '../../../apps/cli/src/runtime/contracts.js';
// Explicit synthetic integration trust. Never wired into production settings or publisher verification.
export async function syntheticVerifier(
  metadata: ReleaseMetadata,
  digest: PayloadDigest,
  attestations: unknown,
): Promise<VerificationReceipt> {
  if (
    metadata.integrity !== `sha512-${Buffer.from(digest.sha512, 'hex').toString('base64')}` ||
    JSON.stringify(attestations) !== '{"synthetic":true}'
  )
    throw new Error('Synthetic signature rejected');
  return {
    formatVersion: 1,
    packageName: 'robopomelo',
    version: metadata.version,
    ...digest,
    identity: 'SYNTHETIC TEST FIXTURE',
    sourceCommit: 'b'.repeat(40),
    verifiedAt: '2026-09-05T00:00:00Z',
  };
}
export async function release(version = '1.0.0', overrides: Record<string, string> = {}) {
  const m = manifest(version),
    payload = { ...runtimeFiles(version), ...overrides };
  m.files = Object.entries(payload).map(([path, body]) => ({
    path,
    size: Buffer.byteLength(body),
    sha256: digest(body),
  }));
  const files = { ...payload, 'runtime-manifest.json': JSON.stringify(m) };
  const bytes = await archive(
    Object.entries(files).map(([path, body]) => ({ name: `package/${path}`, body })),
  );
  const metadata: ReleaseMetadata = {
    version,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    tarball: `https://registry.npmjs.org/robopomelo/-/robopomelo-${version}.tgz`,
    attestations: `https://registry.npmjs.org/-/npm/v1/attestations/robopomelo@${version}`,
  };
  return { metadata, bytes, attestations: { synthetic: true }, manifest: m };
}
