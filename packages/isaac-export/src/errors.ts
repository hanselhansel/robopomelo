/** Typed failures of the Isaac export. Codes are stable identifiers callers may branch on. */
export class IsaacExportError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'IsaacExportError';
  }
}
export const fail = (code: string, message: string): never => { throw new IsaacExportError(code, message); };
