import { lstat } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { stringify } from 'yaml';
import { checkSchema, type Deployment, type Scope } from '@robopomelo/spec';
import { sha256 } from '@robopomelo/core';
import { SafeRoot } from './fs/safe-fs.js';
import { ProjectFsError } from './errors.js';
import { parseSource } from './yaml/parse.js';
import { writeInitialHistory } from './history.js';
export async function initializeProject(
  folder: string,
  deployment: Deployment,
  scopes: readonly Scope[],
): Promise<{ path: string; projectId: string; sourceHash: string }> {
  if (!scopes.includes('author'))
    throw new ProjectFsError('SCOPE_DENIED', 'Creating a project requires explicit author authority.');
  if (checkSchema(deployment).length)
    throw new ProjectFsError(
      'SOURCE_INVALID',
      'The initial project does not match the supported specification.',
    );
  const target = resolve(folder);
  const parent = await SafeRoot.open(dirname(target));
  try {
    let exists = false;
    try {
      const entry = await lstat(target);
      exists = true;
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw new ProjectFsError('INVALID_ROOT', 'Select a regular project directory.');
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
    if (!exists) await parent.mkdir(basename(target));
    const root = await SafeRoot.open(target);
    try {
      if ((await root.list()).length)
        throw new ProjectFsError(
          'PROJECT_NOT_EMPTY',
          'Choose a new or empty project folder. Existing contents were preserved.',
        );
      const source = stringify(deployment, { aliasDuplicateObjects: false, lineWidth: 0 });
      parseSource(source);
      const bytes = Buffer.from(source, 'utf8');
      const file = await root.createExclusive('deployment.yaml');
      try {
        await file.write(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      await root.fsyncDirectory();
      await writeInitialHistory(root, bytes, { projectId: deployment.project.id });
      return {
        path: root.identity().canonicalPath,
        projectId: deployment.project.id,
        sourceHash: sha256(bytes),
      };
    } finally {
      await root.close();
    }
  } finally {
    await parent.close();
  }
}
