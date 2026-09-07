/** Machine-local consent. These scopes never confer review or settings authority. */
export const agentScopes = ['use-connected-ai', 'public-research', 'import-attachments'] as const;
export type AgentScope = (typeof agentScopes)[number];
export type PermissionPreset = 'recommended' | 'inspection';
export interface AgentGrant {
  grantId: string;
  trustGrantId: string;
  generation: number;
  binding: { canonicalPath: string; device: string; fileId: string; projectId: string };
  preset: PermissionPreset;
  scopes: AgentScope[];
  grantedAt: string;
  revokedAt: string | null;
}
export interface AgentAuthorization {
  grantId: string;
  generation: number;
}
