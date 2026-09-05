// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { render, within, fireEvent, cleanup } from '@testing-library/react';
import { createBlankProject } from '@robopomelo/core';
import { questions, type ChallengeAnswer } from '@robopomelo/spec';
import { Planning } from '../src/screens/Planning.js';
afterEach(cleanup);
const prompt = questions.find((question) => question.step === 'frame')!;
function setup(current: boolean) {
  const deployment = createBlankProject({
    id: 'project',
    name: 'Versioned questions',
    revision: 'r1',
    timestamp: '2026-09-05T00:00:00Z',
  });
  const answer = (id: string, version: string, value: string): ChallengeAnswer => ({
    id,
    title: prompt.prompt,
    description: null,
    ownerId: null,
    sourceEvidenceIds: [],
    extensions: {},
    promptId: prompt.id,
    promptVersion: version,
    answer: { state: 'provided', value },
    relatedIds: [],
  });
  deployment.challengeAnswers = [
    answer('historical', '0.9.0', 'Historical answer'),
    ...(current ? [answer('current', prompt.version, 'Current answer')] : []),
  ];
  const edit = vi.fn(),
    view = render(
      <Planning step="frame" deployment={deployment} edit={edit} onView={() => {}} revealId={prompt.id} />,
    );
  return {
    question: within(view.container.querySelector(`#question-${prompt.id}`) as HTMLElement),
    edit,
    deployment,
  };
}
it('edits the current prompt version even when a historical answer appears first', () => {
  const f = setup(true);
  expect(f.question.queryByDisplayValue('Historical answer')).toBeNull();
  fireEvent.change(f.question.getByLabelText('Engineering answer value'), {
    target: { value: 'Updated current answer' },
  });
  expect(f.edit).toHaveBeenCalledWith(expect.objectContaining({ op: 'update', id: 'current' }));
});
it('creates a current-version answer while retaining a historical-only record', () => {
  const f = setup(false);
  expect((f.question.getByLabelText('Engineering answer state') as HTMLSelectElement).value).toBe('missing');
  fireEvent.change(f.question.getByLabelText('Engineering answer state'), { target: { value: 'provided' } });
  expect(f.edit).toHaveBeenCalledWith(
    expect.objectContaining({
      op: 'add',
      record: expect.objectContaining({ promptId: prompt.id, promptVersion: prompt.version }),
    }),
  );
  expect(f.deployment.challengeAnswers[0]?.promptVersion).toBe('0.9.0');
});
