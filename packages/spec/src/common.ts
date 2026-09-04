export type Id = string;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Extensions = Record<string, Json>;
export type Knowledge<T> =
  | null
  | { state: 'provided' | 'unverified'; value: T; note?: string; sourceEvidenceIds?: Id[] }
  | { state: 'unknown'; note: string; ownerId?: Id; nextAction?: string }
  | { state: 'not-applicable'; reason: string };
export interface Actor {
  kind: 'human' | 'agent' | 'external';
  name: string;
  onBehalfOf?: string;
  source?: string;
}
export interface VerificationDeclaration {
  id: Id;
  claimPath: string;
  required: boolean;
  evidenceIds: Id[];
  attestation: null | { actor: Actor; statement: string; recordedAt: string; source: string };
}
export interface RecordBase {
  id: Id;
  title: string;
  description: Knowledge<string>;
  ownerId: Knowledge<Id>;
  sourceEvidenceIds: Id[];
  extensions: Extensions;
  verification?: VerificationDeclaration[];
}
export interface Quantity {
  value: string;
  unit: string;
  subject: string;
}
export interface ProjectInfo {
  id: Id;
  name: string;
  problem: Knowledge<string>;
  outcome: Knowledge<string>;
  scope: Knowledge<string>;
  exclusions: string[];
  approverId: Knowledge<Id>;
}
export interface RevisionMeta {
  revisionId: Id;
  parentRevisionId: Id | null;
  createdAt: string;
  updatedAt: string;
}
