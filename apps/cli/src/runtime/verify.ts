import { bundleFromJSON } from '@sigstore/bundle';
import { TrustedRoot } from '@sigstore/protobuf-specs';
import { Verifier, toSignedEntity, toTrustMaterial, type VerificationPolicy } from '@sigstore/verify';
import trustedRoot from './trust/trusted_root.json';
import { RuntimeError } from './errors.js';
import type { PayloadDigest, ReleaseMetadata, VerificationReceipt } from './contracts.js';
export const publisherIdentity =
  'https://github.com/hanselhansel/robopomelo/.github/workflows/release.yml@refs/heads/main';
export const publisherPolicy: VerificationPolicy = Object.freeze({
  subjectAlternativeName:
    '^https://github\\.com/hanselhansel/robopomelo/\\.github/workflows/release\\.yml@refs/heads/main$',
  extensions: { issuer: 'https://token.actions.githubusercontent.com' },
});
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function failure(): never {
  throw new RuntimeError(
    'RELEASE_UNVERIFIED',
    'Package provenance could not be verified. Keep the working runtime and update the installed launcher through its package manager if the signing trust root has changed.',
  );
}
/** Maintained Sigstore cryptography with local trust only. No TUF/network client is constructed. */
export function verifyBundlePayload(
  bundle: unknown,
  root: unknown,
  policy: VerificationPolicy,
): { payload: Buffer; payloadType: string } {
  try {
    const parsed = bundleFromJSON(bundle as Parameters<typeof bundleFromJSON>[0]);
    const verifier = new Verifier(toTrustMaterial(TrustedRoot.fromJSON(root)), {
      ctlogThreshold: 1,
      tlogThreshold: 1,
      timestampThreshold: 1,
    });
    verifier.verify(toSignedEntity(parsed), policy);
    if (
      !object(bundle) ||
      !object(bundle.dsseEnvelope) ||
      typeof bundle.dsseEnvelope.payload !== 'string' ||
      typeof bundle.dsseEnvelope.payloadType !== 'string'
    )
      failure();
    const bytes = Buffer.from(bundle.dsseEnvelope.payload, 'base64');
    if (bytes.byteLength > 1024 * 1024) failure();
    return { payload: bytes, payloadType: bundle.dsseEnvelope.payloadType };
  } catch {
    return failure();
  }
}
export function verifySignedStatement(bundle: unknown, root: unknown, policy: VerificationPolicy): unknown {
  const verified = verifyBundlePayload(bundle, root, policy);
  if (verified.payloadType !== 'application/vnd.in-toto+json') failure();
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(verified.payload));
  } catch {
    return failure();
  }
}
/** Called only after signature verification; exported internally for exact statement policy tests. */
export function assertPublisherStatement(value: unknown, version: string, sha512: string): string {
  if (
    !object(value) ||
    value._type !== 'https://in-toto.io/Statement/v1' ||
    value.predicateType !== 'https://slsa.dev/provenance/v1' ||
    !Array.isArray(value.subject) ||
    value.subject.length !== 1 ||
    !object(value.predicate)
  )
    failure();
  const subject = value.subject[0];
  if (
    !object(subject) ||
    subject.name !== `pkg:npm/robopomelo@${version}` ||
    !object(subject.digest) ||
    subject.digest.sha512 !== sha512
  )
    failure();
  const build = value.predicate.buildDefinition;
  if (
    !object(build) ||
    build.buildType !== 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1' ||
    !object(build.externalParameters)
  )
    failure();
  const workflow = build.externalParameters.workflow;
  if (
    !object(workflow) ||
    workflow.repository !== 'https://github.com/hanselhansel/robopomelo' ||
    workflow.path !== '.github/workflows/release.yml' ||
    workflow.ref !== 'refs/heads/main'
  )
    failure();
  const dependencies = build.resolvedDependencies;
  if (!Array.isArray(dependencies)) failure();
  const source = dependencies.find(
    (d) => object(d) && d.uri === 'git+https://github.com/hanselhansel/robopomelo@refs/heads/main',
  );
  if (
    !object(source) ||
    !object(source.digest) ||
    typeof source.digest.gitCommit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(source.digest.gitCommit)
  )
    failure();
  return source.digest.gitCommit;
}
export async function verifyRelease(
  metadata: ReleaseMetadata,
  digest: PayloadDigest,
  attestations: unknown,
  clock: () => string = () => new Date().toISOString(),
): Promise<VerificationReceipt> {
  if (
    metadata.integrity !== `sha512-${Buffer.from(digest.sha512, 'hex').toString('base64')}` ||
    !object(attestations) ||
    !Array.isArray(attestations.attestations)
  )
    failure();
  const candidates = attestations.attestations.filter(
    (a) => object(a) && a.predicateType === 'https://slsa.dev/provenance/v1',
  );
  if (candidates.length !== 1) failure();
  const candidate = candidates[0] as Record<string, unknown>;
  const statement = verifySignedStatement(candidate.bundle, trustedRoot, publisherPolicy);
  const sourceCommit = assertPublisherStatement(statement, metadata.version, digest.sha512);
  return {
    formatVersion: 1,
    packageName: 'robopomelo',
    version: metadata.version,
    ...digest,
    sourceCommit,
    identity: publisherIdentity,
    verifiedAt: clock(),
  };
}
