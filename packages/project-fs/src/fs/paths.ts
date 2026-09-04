import { ProjectFsError } from '../errors.js';

declare const relativePath: unique symbol;
export type ProjectRelativePath = string & {[relativePath]:true};
const reserved = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;

export function projectRelativePath(value: string): ProjectRelativePath {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 4096) throw new ProjectFsError('INVALID_PATH', 'A bounded project-relative path is required.');
  for (const segment of value.split('/')) {
    if (!segment || segment === '.' || segment === '..' || /[\x00-\x1f\x7f\\:<>"|?*]/.test(segment) || /[. ]$/.test(segment) || reserved.test(segment) || Buffer.byteLength(segment) > 255 || segment !== segment.normalize('NFC')) {
      throw new ProjectFsError('INVALID_PATH', 'Path contains a nonportable or unsafe segment.');
    }
  }
  return value as ProjectRelativePath;
}

export function portableNameKey(value: string): string { return value.normalize('NFC').toLowerCase(); }
