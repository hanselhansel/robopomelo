import { SafeRoot } from '../../../../packages/project-fs/src/fs/safe-fs.js';
import { walkRuntimeArchive, type ArchiveSource, type ExtractionLimits } from './archive.js';
export type { ExtractionLimits } from './archive.js';
/** Inert streamed extraction. Only regular package files and directories are admitted. */
export async function extractRuntime(
  source: ArchiveSource,
  directory: string,
  limits: Partial<ExtractionLimits> = {},
): Promise<void> {
  const root = await SafeRoot.open(directory),
    directories = new Set<string>();
  async function mkdir(path: string): Promise<void> {
    let part = '';
    for (const segment of path.split('/')) {
      part = part ? `${part}/${segment}` : segment;
      if (!directories.has(part)) {
        try {
          await root.mkdir(part);
        } catch (e) {
          if ((e as { code?: string }).code !== 'EEXIST') throw e;
        }
        directories.add(part);
      }
    }
  }
  try {
    await walkRuntimeArchive(
      source,
      async (entry) => {
        if (entry.type === 'directory') {
          await mkdir(entry.path);
          for await (const _ of entry.bytes) {
            /* empty directory validated by walker */
          }
          return;
        }
        const segments = entry.path.split('/');
        segments.pop();
        if (segments.length) await mkdir(segments.join('/'));
        const file = await root.createExclusive(entry.path);
        try {
          for await (const chunk of entry.bytes) await file.write(chunk);
          await file.sync();
        } finally {
          await file.close();
        }
      },
      limits,
    );
    await root.fsyncDirectory();
  } finally {
    await root.close();
  }
}
