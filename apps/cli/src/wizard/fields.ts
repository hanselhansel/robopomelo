import type { FieldDefinition, FlowStep, FlowException, VerificationDeclaration } from '@robopomelo/spec';
import { editScalar } from './scalar.js';
import { editFlowList } from './nested.js';
import { editVerification } from './verification.js';
import type { EditorContext } from './editor-context.js';
import type { TerminalAdapter } from './terminal.js';
export async function editField(
  terminal: TerminalAdapter,
  field: FieldDefinition,
  previous: unknown,
  context: EditorContext,
): Promise<unknown> {
  if (field.inputKind === 'flow-steps')
    return editFlowList(terminal, 'steps', (previous ?? []) as FlowStep[], context);
  if (field.inputKind === 'flow-exceptions')
    return editFlowList(terminal, 'exceptions', (previous ?? []) as FlowException[], context);
  if (field.inputKind === 'verification')
    return editVerification(terminal, (previous ?? []) as VerificationDeclaration[], context);
  return editScalar(terminal, field, previous, context);
}
