import { it, expect } from 'vitest';
import { fields, workflows } from '../src/fields.js';
import { questions } from '../src/questions.js';
import { capabilities, skillNames } from '../src/capabilities.js';
it('defines exactly five guided steps and stable unique field IDs', () => {
  expect(workflows.map(step=>step.id)).toEqual(['frame','flow','success','requirements','acceptance']);
  expect(new Set(fields.map(field=>field.id)).size).toBe(fields.length);
  for(const field of fields) { expect(field.label.trim()).not.toBe(''); expect(field.help.trim()).not.toBe(''); }
  expect(fields.find(field=>field.collection==='kpis'&&field.path==='baseline')?.inputKind).toBe('knowledge-quantity');
  expect(fields.find(field=>field.collection==='project'&&field.path==='approverId')?.referenceTarget).toBe('stakeholders');
});
it('includes practical engineering questions without model calls', () => {
  expect(new Set(questions.map(q=>q.id)).size).toBe(questions.length);
  expect(questions.map(q=>q.prompt).join(' ')).toMatch(/occupied destination/i);
  expect(questions.map(q=>q.prompt).join(' ')).toMatch(/damaged load/i);
  expect(questions.map(q=>q.prompt).join(' ')).toMatch(/charging/i);
  for(const q of questions) expect(q.answerCollection).toBe('challengeAnswers');
});
it('registers exactly six version-compatible Skills and never enables unstable capabilities', () => {
  expect(skillNames).toHaveLength(6);
  expect(skillNames).toContain('plan-amr-deployment');
  expect(new Set(capabilities.map(c=>c.id)).size).toBe(capabilities.length);
  for(const name of skillNames) expect(capabilities.find(c=>c.id===name)?.specRange).toBe('^1.0.0');
  expect(capabilities.filter(c=>c.stage!=='stable').every(c=>!c.enabledByDefault)).toBe(true);
});
