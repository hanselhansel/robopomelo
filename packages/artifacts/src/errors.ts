export type ArtifactErrorCode = 'EXPORT_SOURCE_STALE' | 'EXPORT_EVIDENCE_CHANGED' | 'EXPORT_PATH_UNSAFE';
/** Expected artifact input failures, safe to expose at local CLI and HTTP boundaries. */
export class ArtifactError extends Error {
  constructor(
    public readonly code: ArtifactErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ArtifactError';
  }
}
