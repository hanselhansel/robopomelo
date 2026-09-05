export class ProjectFsError extends Error {
  constructor(readonly code: string, message: string, readonly line?: number, readonly column?: number) {
    super(message);
    this.name = 'ProjectFsError';
  }
}
