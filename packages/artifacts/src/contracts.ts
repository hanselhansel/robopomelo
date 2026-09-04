import type { ProjectSnapshot } from '@robopomelo/spec';
export interface ArtifactInput {
  source: string;
  snapshot: ProjectSnapshot;
  selectedEvidenceIds: string[];
}
export interface ArtifactMember {
  path: string;
  mediaType: string;
  bytes: Uint8Array;
}
export interface AttachmentMember {
  path: string;
  sourcePath: string;
  evidenceId: string;
  mediaType: string;
  size: number;
  sha256: string;
}
export interface ArtifactPlan {
  members: ArtifactMember[];
  attachments: AttachmentMember[];
}
