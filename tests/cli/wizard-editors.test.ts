import { expect, it } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { NodeTerminal } from '../../apps/cli/src/wizard/terminal.js';
import { editKnowledge } from '../../apps/cli/src/wizard/knowledge.js';
import { editQuantity, editCriterion } from '../../apps/cli/src/wizard/values.js';
function script(answers: string[]) {
  let output = '';
  const terminal = new NodeTerminal({
    stdin: Readable.from([answers.join('\n') + '\n']),
    stdout: new Writable({
      write(chunk, _encoding, done) {
        output += chunk.toString();
        done();
      },
    }),
    isTTY: true,
  });
  return { terminal, output: () => output };
}
it('queues all piped terminal lines and prints without terminal-control injection', async () => {
  const s = script(['2', 'hello']);
  expect(
    await s.terminal.choose('Choice', [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two' },
    ]),
  ).toBe('two');
  expect(await s.terminal.text('Text')).toBe('hello');
  s.terminal.write('\u001b]52;clipboard\u0007');
  expect(s.output()).not.toContain('\u001b');
  s.terminal.close();
});
it.each([
  { answers: ['Missing'], expected: null },
  {
    answers: ['Unknown', 'Peak not measured', 'Measure next shift'],
    expected: { state: 'unknown', note: 'Peak not measured', nextAction: 'Measure next shift' },
  },
  {
    answers: ['Unverified', '0', 'Details', 'Reported count', 'Done'],
    expected: { state: 'unverified', value: '0', note: 'Reported count', sourceEvidenceIds: [] },
  },
  { answers: ['Provided', '0', 'Done'], expected: { state: 'provided', value: '0' } },
  {
    answers: ['Not applicable', 'No staffed handoff'],
    expected: { state: 'not-applicable', reason: 'No staffed handoff' },
  },
])('preserves knowledge variant $answers', async ({ answers, expected }) => {
  const s = script(answers);
  expect(
    await editKnowledge<string>(s.terminal, null, (previous) => s.terminal.text('Value', previous), {
      owner: async () => undefined,
      evidence: async () => [],
    }),
  ).toEqual(expected);
  s.terminal.close();
});
it('keeps entered zero quantity and an explicit false criterion typed', async () => {
  const q = script(['0', 'count/h', 'pallet']);
  expect(await editQuantity(q.terminal)).toEqual({ value: '0', unit: 'count/h', subject: 'pallet' });
  q.terminal.close();
  const b = script(['Boolean', 'False']);
  expect(await editCriterion(b.terminal)).toEqual({ kind: 'boolean', expected: false });
  b.terminal.close();
});
it('edits numeric ranges and categorical criteria without executing a test', async () => {
  const n = script(['Numeric', 'between', '0', 'm', 'distance', '1', 'm', 'distance']);
  expect(await editCriterion(n.terminal)).toEqual({
    kind: 'numeric',
    operator: 'between',
    threshold: { value: '0', unit: 'm', subject: 'distance' },
    upper: { value: '1', unit: 'm', subject: 'distance' },
  });
  n.terminal.close();
  const c = script(['Categorical', 'arrived', 'safe handoff', '.']);
  expect(await editCriterion(c.terminal)).toEqual({
    kind: 'categorical',
    expected: ['arrived', 'safe handoff'],
  });
  c.terminal.close();
});
it('preserves optional notes and source links when explicitly keeping existing details', async () => {
  const s = script(['Provided', 'updated', 'Done']);
  expect(
    await editKnowledge(
      s.terminal,
      { state: 'provided', value: 'old', note: 'Recorded note', sourceEvidenceIds: ['evidence-1'] },
      (previous) => s.terminal.text('Value', previous),
      { owner: async () => undefined, evidence: async () => [] },
    ),
  ).toEqual({
    state: 'provided',
    value: 'updated',
    note: 'Recorded note',
    sourceEvidenceIds: ['evidence-1'],
  });
  s.terminal.close();
});
it('interrupts queued scripted input without consuming another planned edit', async () => {
  const s = script(['first', 'second']);
  expect(await s.terminal.text('First')).toBe('first');
  process.emit('SIGINT');
  await expect(s.terminal.text('Second')).rejects.toHaveProperty('reason', 'interrupt');
  s.terminal.close();
});
