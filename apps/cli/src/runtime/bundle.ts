import { createHash } from 'node:crypto';
import { SafeRoot } from '../../../../packages/project-fs/src/fs/safe-fs.js';
import { parseRuntimeManifest } from './manifest.js';
import { validatePayloadFiles } from './cache-io.js';
import type { RuntimeDescriptor } from './contracts.js';
/** Initial bundle inherits trust from explicit installation, then checks local completeness. */
export async function loadBundledRuntime(directory: string): Promise<RuntimeDescriptor> {
  const root = await SafeRoot.open(directory);
  try {
    const bytes = await root.readFile('runtime-manifest.json', 1024 * 1024);
    const manifest = parseRuntimeManifest(JSON.parse(bytes.toString('utf8')));
    await validatePayloadFiles(root, manifest);
    return {
      manifest,
      directory: root.identity().canonicalPath,
      manifestDigest: createHash('sha256').update(bytes).digest('hex'),
      source: 'bundle',
    };
  } finally {
    await root.close();
  }
}
