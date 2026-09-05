import type { Collection } from './patch.js';

export type FieldKind =
  | 'text'
  | 'multiline'
  | 'knowledge-text'
  | 'knowledge-id'
  | 'knowledge-quantity'
  | 'knowledge-criterion'
  | 'string-list'
  | 'reference-list'
  | 'flow-steps'
  | 'flow-exceptions'
  | 'verification'
  | 'enum'
  | 'boolean';
export type StepId = 'frame' | 'flow' | 'success' | 'requirements' | 'acceptance';
export interface FieldDefinition {
  id: string;
  collection: Collection | 'project';
  path: string;
  label: string;
  inputKind: FieldKind;
  help: string;
  step: StepId;
  referenceTarget?: Collection | Collection[];
  options?: { value: string; label: string }[];
}
export interface ChallengeDefinition {
  id: string;
  version: string;
  step: StepId;
  prompt: string;
  appliesWhen: 'always' | 'has-intended-flow' | 'has-kpi' | 'has-requirement' | 'has-acceptance-test';
  answerCollection: 'challengeAnswers';
}
export interface WorkflowDefinition {
  id: StepId;
  title: string;
  description: string;
  fields: FieldDefinition[];
  questions: ChallengeDefinition[];
}
