import { DomainError } from '@robopomelo/core';
import { ArtifactError } from '@robopomelo/artifacts';
import { RuntimeError } from '../runtime/errors.js';
import { ProjectFsError } from '../../../../packages/project-fs/src/errors.js';
import { HttpError } from './security.js';
const filesystemCodes = new Set([
  'EACCES',
  'EBUSY',
  'EEXIST',
  'EIO',
  'EISDIR',
  'EMFILE',
  'ENFILE',
  'ENOSPC',
  'ENOTDIR',
  'ENOTEMPTY',
  'ENOTSUP',
  'EPERM',
  'EROFS',
  'EXDEV',
  'EINVAL',
]);
const filesystemOperations = new Set([
  'open',
  'read',
  'write',
  'writev',
  'fsync',
  'fdatasync',
  'close',
  'rename',
  'link',
  'unlink',
  'mkdir',
  'rmdir',
  'realpath',
  'lstat',
  'stat',
  'fstat',
  'scandir',
  'readlink',
]);
function filesystemDetails(error: unknown) {
  if (!(error instanceof Error)) return undefined;
  const { code, syscall } = error as NodeJS.ErrnoException;
  if (
    typeof code !== 'string' ||
    typeof syscall !== 'string' ||
    !filesystemCodes.has(code) ||
    !filesystemOperations.has(syscall)
  )
    return undefined;
  // Closed vocabularies only. Never include messages, paths, stacks or nested causes.
  return { systemCode: code, operation: syscall };
}
export function httpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (
    error instanceof DomainError ||
    error instanceof ProjectFsError ||
    error instanceof ArtifactError ||
    error instanceof RuntimeError
  ) {
    const code = error.code;
    const status = /SCOPE|GRANT|AUTHORITY/.test(code)
      ? 403
      : /STALE|CONFLICT|CHANGED|RECONCILIATION|RECOVERY|LOCKED/.test(code)
        ? 409
        : /LIMIT/.test(code)
          ? 413
          : /NOT_FOUND/.test(code)
            ? 404
            : 422;
    return new HttpError(status, code, error.message, 'details' in error ? error.details : undefined);
  }
  if (error instanceof URIError) return new HttpError(400, 'INVALID_URL', 'The request URL is malformed.');
  if ((error as { code?: string })?.code === 'ENOENT')
    return new HttpError(404, 'NOT_FOUND', 'The requested local resource was not found.');
  return new HttpError(
    500,
    'INTERNAL_ERROR',
    'The local operation failed. Inspect its receipt or diagnostics before retrying.',
    filesystemDetails(error),
  );
}
