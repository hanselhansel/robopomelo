import type { Finding, ProjectSnapshot } from '@robopomelo/spec';
export interface CliError {
  code: string;
  message: string;
  cause: string | null;
  action: string;
  details?: unknown;
}
export interface CliEnvelope<T> {
  formatVersion: '1.0.0';
  command: string;
  ok: boolean;
  data: T | null;
  findings: Finding[];
  errors: CliError[];
  sourceRevision: string | null;
  sourceHash: string | null;
  toolVersion: string;
  specVersion: string | null;
}
export function exitForError(error: unknown): number {
  const code = String((error as { code?: unknown })?.code ?? '');
  if (code === 'FIELD_NOT_ALLOWED') return 5;
  if (code === 'RUNTIME_UNAVAILABLE') return 7;
  if (/RELEASE|UPDATE_|INTEGRITY|DOWNLOAD|NETWORK/.test(code)) return 8;
  if (/UNSUPPORTED|INCOMPATIBLE|RUNTIME_REQUIRED/.test(code)) return 7;
  if (/SCOPE|GRANT|AUTHORITY/.test(code)) return 5;
  if (/STALE|CONFLICT|PROJECT_CHANGED|MUTATION_RETIRED/.test(code)) return 4;
  if (/SPECIFICATION_BLOCKED|WARNINGS_UNACKNOWLEDGED/.test(code)) return 3;
  if (/INVALID_|NOT_ALLOWED|DUPLICATE_|EMPTY_|ERR_PARSE_ARGS/.test(code) || error instanceof SyntaxError)
    return 2;
  if (
    /^(E[A-Z]+)$|SOURCE_|PATH_|HISTORY_|RECOVERY_|IO_|LIMIT_|ROOT_|PROJECT_NOT|PROPOSAL_|SETTINGS_|LOCK|EVIDENCE_|SELECTION_|UPLOAD_|EXPORT_|STORAGE_|CACHE_|MIGRATION_/.test(
      code,
    )
  )
    return 6;
  return 1;
}
export function successEnvelope<T>(
  command: string,
  data: T,
  context: { toolVersion: string; snapshot?: ProjectSnapshot },
): CliEnvelope<T> {
  const snapshot = context.snapshot;
  return {
    formatVersion: '1.0.0',
    command,
    ok: true,
    data,
    findings: snapshot?.validation.findings ?? [],
    errors: [],
    sourceRevision: snapshot?.sourceRevision ?? null,
    sourceHash: snapshot?.sourceHash ?? null,
    toolVersion: context.toolVersion,
    specVersion: snapshot?.deployment.specVersion ?? null,
  };
}
export function errorEnvelope(command: string, error: unknown, toolVersion: string): CliEnvelope<never> {
  const details = error as {
    code?: string;
    details?: unknown;
    message?: string;
    backupManifest?: string;
    sourceHash?: string;
  };
  const code = typeof details?.code === 'string' ? details.code : 'INTERNAL_ERROR';
  const message =
    error instanceof Error
      ? error.message
      : typeof details?.message === 'string'
        ? details.message
        : 'The command failed.';
  return {
    formatVersion: '1.0.0',
    command,
    ok: false,
    data: null,
    findings: [],
    errors: [
      {
        code,
        message,
        cause: null,
        action:
          exitForError(error) === 4
            ? 'Inspect the current source or change receipt before retrying.'
            : `Run robopomelo ${command} --help for inputs and recovery guidance.`,
        ...(details?.details !== undefined
          ? { details: details.details }
          : details?.backupManifest || details?.sourceHash
            ? { details: { backupManifest: details.backupManifest, sourceHash: details.sourceHash } }
            : {}),
      },
    ],
    sourceRevision: null,
    sourceHash: null,
    toolVersion,
    specVersion: null,
  };
}
