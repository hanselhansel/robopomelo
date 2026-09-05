import semver from 'semver';
import { SafeRoot } from '../../../../packages/project-fs/src/fs/safe-fs.js';
import { parseSource } from '../../../../packages/project-fs/src/yaml/parse.js';
import { RuntimeError } from './errors.js';
/** Local-only read. Parse failures retain the source for the caller's inspection flow. */
export async function probeProjectSpecVersion(directory: string): Promise<string> {
  const root = await SafeRoot.open(directory);
  try {
    const source = await root.readFile('deployment.yaml', 8 * 1024 * 1024);
    const version = parseSource(source).value.specVersion;
    if (typeof version !== 'string' || !semver.valid(version))
      throw new RuntimeError(
        'SPEC_VERSION_UNREADABLE',
        'The project specification version cannot be read. Open the source in inspection mode.',
      );
    return version;
  } finally {
    await root.close();
  }
}
