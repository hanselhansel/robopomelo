import type { Authorization, SourceIdentity } from '../contracts.js';
export interface ExportMember {
  path: string;
  mediaType: string;
  bytes: Uint8Array;
}
export interface ExportAttachment {
  path: string;
  sourcePath: string;
  evidenceId: string;
  mediaType: string;
  size: number;
  sha256: string;
}
/** Structural artifact boundary; project-fs does not depend on the rendering package. */
export interface ExportPlan {
  members: ExportMember[];
  attachments: ExportAttachment[];
}
export type FrozenMember = { path: string; mediaType: string; size: number; sha256: string } & (
  { kind: 'bytes'; bytes: Buffer } | { kind: 'attachment'; sourcePath: string; evidenceId: string }
);
export interface FrozenExport {
  expected: SourceIdentity;
  members: FrozenMember[];
  payloadBytes: number;
}
export interface ExportOptions {
  format: 'files' | 'zip';
  name?: string;
  authorization: Authorization;
  signal?: AbortSignal;
  onProgress?: (event: { path: string; bytes: number }) => void | Promise<void>;
}
export interface ExportResult {
  path: string;
  format: 'files' | 'zip';
  sourceRevision: string;
  sourceHash: string;
  memberCount: number;
  bytes: number;
  sha256?: string;
}
export const EXPORT_LIMIT = 2 * 1024 * 1024 * 1024;
