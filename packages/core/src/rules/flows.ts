import { questions, type Deployment, type ChallengeDefinition } from '@robopomelo/spec';
import { disposition, person, textValue } from './helpers.js';
import type { Emit } from './catalogue.js';
export function promptApplies(d: Deployment, condition: ChallengeDefinition['appliesWhen']): boolean {
  switch (condition) {
    case 'always':
      return true;
    case 'has-intended-flow':
      return d.workflows.some((w) => w.mode === 'intended');
    case 'has-kpi':
      return d.kpis.length > 0;
    case 'has-requirement':
      return d.requirements.length > 0;
    case 'has-acceptance-test':
      return d.acceptanceTests.length > 0;
  }
}
export function flows(d: Deployment, emit: Emit): void {
  const intended = d.workflows.filter((w) => w.mode === 'intended');
  if (!intended.length) emit('RP-020', [d.project.id], ['/workflows']);
  d.workflows.forEach((w, i) => {
    if (w.mode !== 'intended') return;
    for (const key of ['loadSubject', 'origin', 'destination'] as const)
      if (!textValue(w[key])) emit('RP-020', [w.id], [`/workflows/${i}/${key}`]);
    if (!person(d, w.ownerId)) emit('RP-011', [w.id], [`/workflows/${i}/ownerId`]);
    w.exceptions.forEach((e, j) => {
      if (!person(d, e.ownerId)) emit('RP-011', [e.id], [`/workflows/${i}/exceptions/${j}/ownerId`]);
    });
    if (w.volume?.state === 'unknown' || w.volume?.state === 'unverified')
      emit('RP-022', [w.id], [`/workflows/${i}/volume`]);
  });
  for (const prompt of questions)
    if (promptApplies(d, prompt.appliesWhen)) {
      const answers = d.challengeAnswers.filter(
        (a) => a.promptId === prompt.id && a.promptVersion === prompt.version,
      );
      if (answers.length !== 1 || !disposition(answers[0]!.answer))
        emit(
          'RP-021',
          answers.map((a) => a.id),
          ['/challengeAnswers'],
          prompt.id,
        );
      if (
        prompt.id === 'peak-volume' &&
        answers.some((a) => a.answer?.state === 'unknown' || a.answer?.state === 'unverified')
      )
        emit(
          'RP-022',
          answers.map((a) => a.id),
          ['/challengeAnswers'],
          prompt.id,
        );
    }
}
