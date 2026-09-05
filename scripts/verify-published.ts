import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { RuntimeCache } from '../apps/cli/src/runtime/cache.js';
import { PublicReleaseNetwork } from '../apps/cli/src/runtime/network.js';
import { releaseMetadata } from '../apps/cli/src/runtime/metadata.js';
export async function verifiedPublished(version: string, directory: string) {
  const network = new PublicReleaseNetwork();
  const metadata = await releaseMetadata(network, version);
  const attestations = await network.json(metadata.attestations);
  const runtime = await new RuntimeCache({ directory }).install(
    metadata,
    (sink) => network.consume(metadata.tarball, sink, { maxBytes: 64 * 1024 * 1024, timeoutMs: 15000 }),
    attestations,
  );
  const receipt = JSON.parse(await readFile(join(dirname(runtime.directory), 'verified.json'), 'utf8'));
  return { runtime, receipt, metadata, tarball: join(dirname(runtime.directory), 'payload.tgz') };
}
export async function verifiedBootstrap(
  manifest: { version: string; integrity: string },
  tarball: string,
  bundle: unknown,
  directory: string,
) {
  const metadata = {
    version: manifest.version,
    integrity: manifest.integrity,
    tarball: `https://registry.npmjs.org/robopomelo/-/robopomelo-${manifest.version}.tgz`,
    attestations: `https://registry.npmjs.org/-/npm/v1/attestations/robopomelo@${manifest.version}`,
  };
  const runtime = await new RuntimeCache({ directory }).install(
    metadata,
    async (sink) => {
      for await (const bytes of createReadStream(tarball)) await sink(bytes as Buffer);
    },
    { attestations: [{ predicateType: 'https://slsa.dev/provenance/v1', bundle }] },
  );
  const receipt = JSON.parse(await readFile(join(dirname(runtime.directory), 'verified.json'), 'utf8'));
  return { runtime, receipt };
}
