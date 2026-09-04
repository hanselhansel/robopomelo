import { expect, it, vi } from 'vitest';
import bundle from './helpers/sigstore/test-bundle.json';
import trust from './helpers/sigstore/test-trusted-root.json';
import {
  verifyBundlePayload,
  verifySignedStatement,
  assertPublisherStatement,
  publisherPolicy,
  verifyRelease,
} from '../../apps/cli/src/runtime/verify.js';
const policy = {
  subjectAlternativeName: '^brian@dehamer\\.com$',
  extensions: { issuer: 'https://github.com/login/oauth' },
};
it('cryptographically verifies an upstream synthetic DSSE fixture with certificate, CT, log and signing time', () => {
  expect(verifyBundlePayload(bundle, trust, policy).payload.toString()).toBe('hello, world!');
  const bad = structuredClone(bundle);
  bad.dsseEnvelope.signatures[0]!.sig = Buffer.from('invalid signature').toString('base64');
  expect(() => verifyBundlePayload(bad, trust, policy)).toThrow();
});
it('rejects a cryptographically valid signer outside the exact publisher identity', () => {
  expect(() => verifySignedStatement(bundle, trust, publisherPolicy)).toThrow();
  expect(publisherPolicy.subjectAlternativeName).toBe(
    '^https://github\\.com/hanselhansel/robopomelo/\\.github/workflows/release\\.yml@refs/heads/main$',
  );
});
it('makes no hidden network calls even with invalid or empty trust material', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
  for (const root of [{}, { ...trust, certificateAuthorities: [] }, { ...trust, tlogs: [] }])
    expect(() => verifySignedStatement(bundle, root, publisherPolicy)).toThrow();
  await expect(
    verifyRelease(
      {
        version: '1.0.0',
        integrity: 'sha512-' + Buffer.alloc(64).toString('base64'),
        tarball: 'https://registry.npmjs.org/robopomelo/-/robopomelo-1.0.0.tgz',
        attestations: 'https://registry.npmjs.org/-/npm/v1/attestations/robopomelo@1.0.0',
      },
      { sha256: '0'.repeat(64), sha512: '0'.repeat(128) },
      { attestations: [{ predicateType: 'https://slsa.dev/provenance/v1', bundle }] },
    ),
  ).rejects.toMatchObject({ code: 'RELEASE_UNVERIFIED' });
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
});
function statement() {
  return {
    _type: 'https://in-toto.io/Statement/v1',
    predicateType: 'https://slsa.dev/provenance/v1',
    subject: [{ name: 'pkg:npm/robopomelo@1.0.0', digest: { sha512: 'a'.repeat(128) } }],
    predicate: {
      buildDefinition: {
        buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
        externalParameters: {
          workflow: {
            repository: 'https://github.com/hanselhansel/robopomelo',
            path: '.github/workflows/release.yml',
            ref: 'refs/heads/main',
          },
        },
        resolvedDependencies: [
          {
            uri: 'git+https://github.com/hanselhansel/robopomelo@refs/heads/main',
            digest: { gitCommit: 'b'.repeat(40) },
          },
        ],
      },
    },
  };
}
it('binds the verified statement to exact package, digest, repository and workflow', () => {
  expect(assertPublisherStatement(statement(), '1.0.0', 'a'.repeat(128))).toBe('b'.repeat(40));
  for (const change of ['package', 'digest', 'repository', 'workflow', 'ref'] as const) {
    const s = statement();
    if (change === 'package') s.subject[0]!.name = 'pkg:npm/other@1.0.0';
    else if (change === 'digest') s.subject[0]!.digest.sha512 = 'c'.repeat(128);
    else if (change === 'repository')
      s.predicate.buildDefinition.externalParameters.workflow.repository = 'https://github.com/other/repo';
    else if (change === 'workflow')
      s.predicate.buildDefinition.externalParameters.workflow.path = '.github/workflows/other.yml';
    else s.predicate.buildDefinition.externalParameters.workflow.ref = 'refs/heads/feature';
    expect(() => assertPublisherStatement(s, '1.0.0', 'a'.repeat(128))).toThrow();
  }
});
