import { DomainError } from '@robopomelo/core';
import { ProjectFsError } from '../../../../packages/project-fs/src/errors.js';
import { HttpError } from './security.js';
export function httpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof DomainError || error instanceof ProjectFsError) {
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
  );
}
