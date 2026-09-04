import type { Knowledge } from '@robopomelo/spec';
export function hasValue<T>(value: Knowledge<T> | undefined): value is Extract<NonNullable<Knowledge<T>>, {state:'provided'|'unverified'}> {
  return value != null && (value.state === 'provided' || value.state === 'unverified');
}
export function knowledgeText<T>(knowledge: Knowledge<T> | undefined, display: (value:T) => string = value => String(value)): string {
  if (knowledge == null) return 'Missing';
  if (knowledge.state === 'unknown') return `Unknown: ${knowledge.note}`;
  if (knowledge.state === 'not-applicable') return `Not applicable: ${knowledge.reason}`;
  const text = display(knowledge.value);
  return knowledge.state === 'unverified' ? `Unverified: ${text}` : text;
}
