import type { Capability, FieldDefinition } from '@robopomelo/spec';
export interface SkillRegistry {
  capabilities: readonly Capability[];
  skillNames: readonly string[];
  fields: readonly FieldDefinition[];
  commandRegistry: readonly { name: string }[];
  parseCommand(args: string[]): unknown;
}
export function loadSkillRegistry(): Promise<SkillRegistry>;
export function checkSkills(root: string, registry: SkillRegistry): Promise<string[]>;
