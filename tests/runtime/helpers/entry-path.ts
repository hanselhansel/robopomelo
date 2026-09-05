import { fileURLToPath } from 'node:url';
export function fixtureEntry(relative: string, origin: string | URL): string {
  return fileURLToPath(new URL(relative, origin));
}
