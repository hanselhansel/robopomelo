import type { SafeRoot } from './safe-fs.js';
/** Make copied file names and newly created directory ancestors durable before publishing success. */
export async function flushContainingDirectories(root: SafeRoot, paths: readonly string[]): Promise<void> {
  const directories = new Set<string>(['']);
  for (const path of paths) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/'));
  }
  const depth = (path: string) => (path ? path.split('/').length : 0);
  for (const path of [...directories].sort((a, b) => depth(b) - depth(a) || (a < b ? -1 : a > b ? 1 : 0)))
    await root.fsyncDirectory(path || undefined);
}
