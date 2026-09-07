import type { ProjectSnapshot } from '@robopomelo/spec';
export interface ArtifactInput {
  source: string;
  snapshot: ProjectSnapshot;
  selectedEvidenceIds: string[];
  /** Additional generated members (for example a target export package). They are
   * listed in the manifest like every other member and must not collide with core paths. */
  extraMembers?: ArtifactMember[];
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
