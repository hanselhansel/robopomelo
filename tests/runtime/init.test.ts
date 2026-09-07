import { it, expect } from 'vitest';
import { mkdtemp, readFile, mkdir, writeFile, rm, rename, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBlankProject } from '@robopomelo/core';
import { initializeProject } from '../../packages/project-fs/src/init.js';
import { parseSource } from '../../packages/project-fs/src/yaml/parse.js';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';
const draft = () =>
  createBlankProject({
    id: 'project-new',
    name: 'Receiving',
    revision: 'rev-new',
    timestamp: '2026-09-05T00:00:00Z',
  });
it('creates source and an initial immutable revision in an explicit new folder', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'robopomelo-init-'));
  try {
    const path = join(parent, 'Receiving');
    const result = await initializeProject(path, draft(), ['author']);
    expect(result.projectId).toBe('project-new');
    expect(parseSource(await readFile(join(path, 'deployment.yaml'))).value.project).toMatchObject({
      name: 'Receiving',
    });
    expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
it('rejects missing authority and never overwrites a nonempty selected folder', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'robopomelo-init-'));
  try {
    await expect(initializeProject(join(parent, 'Denied'), draft(), [])).rejects.toMatchObject({
      code: 'SCOPE_DENIED',
    });
    const existing = join(parent, 'Existing');
    await mkdir(existing);
    await writeFile(join(existing, 'keep.txt'), 'original');
    await expect(initializeProject(existing, draft(), ['author'])).rejects.toMatchObject({
      code: 'PROJECT_NOT_EMPTY',
    });
    expect(await readFile(join(existing, 'keep.txt'), 'utf8')).toBe('original');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
it('initializes only the pinned expected root and refuses a replacement or missing directory', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'robopomelo-init-')));
  try {
    const path = join(parent, 'Pinned');
    await mkdir(path);
    const pinned = await SafeRoot.open(path);
    const expectedRoot = pinned.identity();
    await pinned.close();
    await rename(path, path + '-original');
    await mkdir(path);
    await expect(initializeProject(path, draft(), ['author'], { expectedRoot })).rejects.toMatchObject({
      code: 'ROOT_CHANGED',
    });
    await expect(readFile(join(path, 'deployment.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
    await rm(path, { recursive: true });
    await expect(initializeProject(path, draft(), ['author'], { expectedRoot })).rejects.toMatchObject({
      code: 'ROOT_CHANGED',
    });
    await expect(readFile(join(path, 'deployment.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
    await rename(path + '-original', path);
    const result = await initializeProject(path, draft(), ['author'], { expectedRoot });
    expect(result.path).toBe(path);
    expect(parseSource(await readFile(join(path, 'deployment.yaml'))).value.project).toMatchObject({ id: 'project-new' });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
