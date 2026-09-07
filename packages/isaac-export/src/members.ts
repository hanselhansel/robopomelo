import { fail } from './errors.js';
/** Structurally identical to project-fs ExportMember; kept local so this package stays pure. */
export interface ExportMember { path: string; mediaType: string; bytes: Uint8Array }
export const ROOT = 'isaac/';
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/, SEGMENT_ANY_CASE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const encoder = new TextEncoder();
export const utf8 = (text: string): Uint8Array => encoder.encode(text);
export const textMember = (path: string, mediaType: string, text: string): ExportMember => ({ path, mediaType, bytes: utf8(text) });
export const jsonMember = (path: string, value: unknown): ExportMember => textMember(path, 'application/json', `${JSON.stringify(value, null, 2)}\n`);
/** Every member path must be a relative, normalized, lowercase path under `isaac/`
 * with no `.`/`..` segments; paths must also be unique case-insensitively so
 * the bundle extracts identically on case-insensitive filesystems. */
export function validateMemberPaths(members: readonly { path: string }[], options: { allowUppercase?: boolean } = {}): void {
  const seen = new Map<string, string>(), segment = options.allowUppercase ? SEGMENT_ANY_CASE : SEGMENT;
  for (const { path } of members) {
    if (typeof path !== 'string' || !path.startsWith(ROOT) || path.length > 200) fail('PATH_INVALID', `member path ${JSON.stringify(path)} must be under ${ROOT}.`);
    const parts = path.split('/');
    if (parts.length < 2 || parts.some((part) => !segment.test(part) || part === '.' || part === '..')) fail('PATH_INVALID', `member path ${JSON.stringify(path)} has an invalid segment.`);
    const key = path.toLowerCase(), previous = seen.get(key);
    if (previous !== undefined) fail('PATH_COLLISION', `member paths ${previous} and ${path} collide case-insensitively.`);
    seen.set(key, path);
  }
}
